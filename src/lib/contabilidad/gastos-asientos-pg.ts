import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { generarAsientoEnTx, type AsientoLineaInput } from "@/lib/contabilidad/asientos-pg";

/**
 * Asientos contables de los GASTOS con RECIBO (sin factura) del módulo Gastos.
 *
 * Los recibos de gasto no se contabilizaban: el comprobante salía siempre como
 * "vista previa". Acá se registra el asiento en Contabilidad (asientos_contables):
 *   Debe  → cuenta contable del gasto
 *   Haber → cuenta del banco o la caja chica de donde salió el dinero
 *
 * Solo recibos sin factura (facturado = false) con cuenta de gasto y origen de
 * dinero. Idempotente por (origen_tipo, origen_id, evento) — lo garantiza
 * `generarAsientoEnTx`. Best-effort: si falta una cuenta o el período está
 * cerrado, el gasto NO se rompe; simplemente queda sin asiento.
 */

type Client = import("pg").PoolClient;

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

export interface ContabGastoResult {
  status: "contabilizado" | "ya_contabilizado" | "omitido" | "error";
  asientoId?: string;
  motivo?: string;
}

interface GastoRow {
  fecha: string;
  monto: string;
  facturado: boolean | null;
  cuenta_contable_id: string | null;
  entidad_bancaria_id: string | null;
  caja_chica_id: string | null;
  categoria: string | null;
  descripcion: string | null;
  proveedor_nombre: string | null;
}

/** Resuelve un código de cuenta del plan a su id (activa + asentable). null si no existe. */
async function idDeCuenta(client: Client, schema: string, empresaId: string, codigo: string | null): Promise<string | null> {
  if (!codigo) return null;
  const tPC = quoteSchemaTable(schema, "plan_cuentas");
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM ${tPC} WHERE empresa_id=$1::uuid AND activo=true AND asentable=true AND cuenta=$2 LIMIT 1`,
    [empresaId, codigo]
  );
  return rows[0]?.id ?? null;
}

/** Id de la cuenta de contrapartida (banco o caja chica), con fallback a la config contable. */
async function contrapartidaId(client: Client, schema: string, empresaId: string, g: GastoRow): Promise<string | null> {
  if (g.entidad_bancaria_id) {
    const t = quoteSchemaTable(schema, "entidades_bancarias");
    const { rows } = await client.query<{ cuenta_contable_codigo: string | null }>(
      `SELECT cuenta_contable_codigo FROM ${t} WHERE id=$1::uuid AND empresa_id=$2::uuid`,
      [g.entidad_bancaria_id, empresaId]
    );
    const id = await idDeCuenta(client, schema, empresaId, rows[0]?.cuenta_contable_codigo ?? null);
    if (id) return id;
  } else if (g.caja_chica_id) {
    const t = quoteSchemaTable(schema, "cajas_chicas");
    const { rows } = await client.query<{ cuenta_contable_codigo: string | null }>(
      `SELECT cuenta_contable_codigo FROM ${t} WHERE id=$1::uuid AND empresa_id=$2::uuid`,
      [g.caja_chica_id, empresaId]
    );
    const id = await idDeCuenta(client, schema, empresaId, rows[0]?.cuenta_contable_codigo ?? null);
    if (id) return id;
  }
  // Fallback: cuenta de banco / caja de la configuración contable de la empresa.
  const tCfg = quoteSchemaTable(schema, "configuracion_contable");
  const { rows: cfg } = await client.query<{ cuenta_banco_id: string | null; cuenta_caja_id: string | null }>(
    `SELECT cuenta_banco_id, cuenta_caja_id FROM ${tCfg} WHERE empresa_id=$1::uuid`,
    [empresaId]
  );
  return (g.entidad_bancaria_id ? cfg[0]?.cuenta_banco_id : cfg[0]?.cuenta_caja_id) ?? null;
}

/** Contabiliza un recibo de gasto (idempotente). Crea el asiento si aún no existe. Best-effort. */
export async function contabilizarGasto(schemaRaw: string, empresaId: string, gastoId: string, createdBy: string | null): Promise<ContabGastoResult> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tG = quoteSchemaTable(schema, "gastos");
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<GastoRow>(
      `SELECT to_char(fecha,'YYYY-MM-DD') AS fecha, monto, facturado, cuenta_contable_id,
              entidad_bancaria_id, caja_chica_id, categoria, descripcion, proveedor_nombre
         FROM ${tG} WHERE id=$1::uuid AND empresa_id=$2::uuid FOR UPDATE`,
      [gastoId, empresaId]
    );
    const g = rows[0];
    if (!g) { await client.query("ROLLBACK"); return { status: "omitido", motivo: "gasto inexistente" }; }
    // Solo recibos sin factura: los facturados pueden ir por el Libro de Compras.
    if (g.facturado !== false) { await client.query("ROLLBACK"); return { status: "omitido", motivo: "facturado" }; }
    if (!g.cuenta_contable_id) { await client.query("ROLLBACK"); return { status: "omitido", motivo: "sin cuenta de gasto" }; }
    if (!g.entidad_bancaria_id && !g.caja_chica_id) { await client.query("ROLLBACK"); return { status: "omitido", motivo: "sin origen de dinero" }; }

    const monto = Number(g.monto) || 0;
    if (!(monto > 0)) { await client.query("ROLLBACK"); return { status: "omitido", motivo: "monto en cero" }; }

    const contraId = await contrapartidaId(client, schema, empresaId, g);
    if (!contraId) { await client.query("ROLLBACK"); return { status: "omitido", motivo: "sin cuenta de contrapartida (banco/caja)" }; }

    const detalle = String(g.descripcion ?? "").trim() || String(g.categoria ?? "Gasto");
    const glosa = [String(g.categoria ?? "").trim(), String(g.proveedor_nombre ?? "").trim(), detalle].filter(Boolean).join(" · ");

    const lineas: AsientoLineaInput[] = [
      { cuenta_contable_id: g.cuenta_contable_id, descripcion: detalle, debe: monto, haber: 0, documento_tipo: "gasto", documento_id: gastoId },
      { cuenta_contable_id: contraId, descripcion: "Pago del gasto", debe: 0, haber: monto, documento_tipo: "gasto", documento_id: gastoId },
    ];

    const asiento = await generarAsientoEnTx(client, schema, empresaId, {
      origen_tipo: "gasto_servicio",
      origen_id: gastoId,
      evento_origen: "alta",
      fecha_contable: g.fecha,
      glosa: `Gasto ${glosa}`.slice(0, 300),
      moneda: "PYG",
      tipo_cambio: 1,
      lineas,
      createdBy,
    });
    await client.query("COMMIT");
    return { status: "contabilizado", asientoId: asiento.id };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    return { status: "error", motivo: e instanceof Error ? e.message : "Error al contabilizar el gasto." };
  } finally {
    client.release();
  }
}

export interface SweepGastosResult { contabilizados: number; ya: number; omitidos: number; error: number; errores: { id: string; motivo: string }[] }

/** Backfill idempotente: contabiliza todo recibo de gasto (sin factura) que aún no tenga asiento. */
export async function sweepContabilizarGastos(schemaRaw: string, empresaId: string, createdBy: string | null): Promise<SweepGastosResult> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tG = quoteSchemaTable(schema, "gastos");
  const tA = quoteSchemaTable(schema, "asientos_contables");
  const res: SweepGastosResult = { contabilizados: 0, ya: 0, omitidos: 0, error: 0, errores: [] };
  // Recibos sin factura con cuenta y origen, que no tengan ya un asiento de gasto.
  const { rows } = await pool().query<{ id: string }>(
    `SELECT g.id FROM ${tG} g
      WHERE g.empresa_id=$1::uuid AND g.facturado = false AND g.cuenta_contable_id IS NOT NULL
        AND (g.entidad_bancaria_id IS NOT NULL OR g.caja_chica_id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM ${tA} a
           WHERE a.empresa_id=$1::uuid AND a.origen_tipo='gasto_servicio' AND a.origen_id=g.id
        )
      ORDER BY g.fecha ASC`,
    [empresaId]
  );
  for (const r of rows) {
    const x = await contabilizarGasto(schema, empresaId, r.id, createdBy);
    if (x.status === "contabilizado") res.contabilizados++;
    else if (x.status === "ya_contabilizado") res.ya++;
    else if (x.status === "error") { res.error++; res.errores.push({ id: r.id, motivo: x.motivo ?? "" }); }
    else res.omitidos++;
  }
  return res;
}
