import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { generarAsientoEnTx, getAsientoConDetalles, type AsientoLineaInput } from "@/lib/contabilidad/asientos-pg";
import { preAsiento, type LineaCalc } from "@/lib/compras-libro/calculo";

/**
 * Asientos contables de las COMPRAS del Libro de Compras.
 *
 * Las compras no se contabilizaban: solo se mostraba un pre-asiento. Acá se
 * registra ese mismo asiento en Contabilidad (tabla asientos_contables) y se
 * guarda el id en `libro_compras.asiento_contable_id`.
 *
 * Reusa `preAsiento()` (misma lógica que el formulario y el PDF) y resuelve los
 * códigos de cuenta a sus ids del plan. Idempotente por (origen, evento). Todo
 * best-effort: si el asiento falla (falta una cuenta, período cerrado, etc.) la
 * compra NO se rompe; simplemente queda sin asiento.
 */

type Client = import("pg").PoolClient;

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

export interface ContabCompraResult { status: "contabilizado" | "ya_contabilizado" | "omitido" | "error"; asientoId?: string; motivo?: string }

const IVA_DEFAULT = "2.01.03.01.002";
const PROV_DEFAULT = "2.01.01.04.000";

/** Arma las líneas del asiento (con ids) para una compra. null si no se puede. */
async function construirAsientoCompra(client: Client, schema: string, empresaId: string, compraId: string): Promise<
  | { lineas: AsientoLineaInput[]; fecha: string; glosa: string; moneda: string; tipo_cambio: number }
  | { error: string }
> {
  const tC = quoteSchemaTable(schema, "libro_compras");
  const tL = quoteSchemaTable(schema, "libro_compras_lineas");
  const tT = quoteSchemaTable(schema, "compra_tipos_comprobante");
  const tCfg = quoteSchemaTable(schema, "libro_compras_config");
  const tPC = quoteSchemaTable(schema, "plan_cuentas");

  const { rows: cr } = await client.query<{
    fecha: string; moneda: string; cotizacion: string; impacta: string | null;
    retencion_iva: string | null; retencion_renta: string | null;
    nro_comprobante: string | null; numero_control: string | null; proveedor_nombre: string | null;
    explicacion: string | null; tipo_id: string; estado: string | null;
  }>(
    `SELECT to_char(fecha,'YYYY-MM-DD') AS fecha, moneda, cotizacion, impacta, retencion_iva, retencion_renta,
            nro_comprobante, numero_control, proveedor_nombre, explicacion, tipo_id, estado
       FROM ${tC} WHERE id=$1::uuid AND empresa_id=$2::uuid`,
    [compraId, empresaId]
  );
  const c = cr[0];
  if (!c) return { error: "compra inexistente" };

  const { rows: tr } = await client.query<{ cuenta_codigo: string | null; condicion: string; es_nota_credito: boolean; nombre: string | null }>(
    `SELECT cuenta_codigo, condicion, es_nota_credito, nombre FROM ${tT} WHERE id=$1::uuid AND empresa_id=$2::uuid`,
    [c.tipo_id, empresaId]
  );
  const tipo = tr[0];

  const { rows: cfgr } = await client.query<{ cuenta_iva_credito: string | null; cuenta_proveedores: string | null; cuenta_retencion_iva: string | null; cuenta_retencion_renta: string | null }>(
    `SELECT cuenta_iva_credito, cuenta_proveedores, cuenta_retencion_iva, cuenta_retencion_renta FROM ${tCfg} WHERE empresa_id=$1::uuid`,
    [empresaId]
  );
  const cfg = cfgr[0] ?? { cuenta_iva_credito: IVA_DEFAULT, cuenta_proveedores: PROV_DEFAULT, cuenta_retencion_iva: null, cuenta_retencion_renta: null };

  const { rows: lr } = await client.query<{ cuenta_codigo: string | null; exentas: string; gravadas: string; iva_porcentaje: number }>(
    `SELECT cuenta_codigo, exentas, gravadas, iva_porcentaje FROM ${tL} WHERE compra_id=$1::uuid AND empresa_id=$2::uuid ORDER BY orden`,
    [compraId, empresaId]
  );
  if (!lr.length) return { error: "compra sin renglones" };

  const impacta = String(c.impacta ?? "");
  const imputaGlobal = impacta !== "NO_IMPUTA" && impacta !== "SOLO_IRE";
  const lineasCalc: LineaCalc[] = lr.map((l) => ({
    cuenta_codigo: l.cuenta_codigo || null,
    exentas: Number(l.exentas) || 0,
    gravadas: Number(l.gravadas) || 0,
    iva_porcentaje: (Number(l.iva_porcentaje) === 5 || Number(l.iva_porcentaje) === 10 ? Number(l.iva_porcentaje) : 0) as 0 | 5 | 10,
    imputa_iva: imputaGlobal,
  }));

  const nro = String(c.nro_comprobante ?? c.numero_control ?? "");
  const detalle = (String(c.explicacion ?? "").trim()) || [tipo?.nombre, c.proveedor_nombre, nro].filter(Boolean).join(" ");
  const moneda = String(c.moneda ?? "PYG");

  const { lineas: asiento } = preAsiento({
    lineas: lineasCalc,
    moneda,
    condicion: tipo?.condicion === "CREDITO" ? "CREDITO" : "CONTADO",
    esNotaCredito: tipo?.es_nota_credito === true,
    cuentaTipo: tipo?.cuenta_codigo ?? null,
    cuentaIva: cfg.cuenta_iva_credito || IVA_DEFAULT,
    cuentaProveedores: cfg.cuenta_proveedores || PROV_DEFAULT,
    cuentaRetIva: cfg.cuenta_retencion_iva,
    cuentaRetRenta: cfg.cuenta_retencion_renta,
    retencionIva: Number(c.retencion_iva) || 0,
    retencionRenta: Number(c.retencion_renta) || 0,
    detalle,
  });

  // Resolver códigos -> ids del plan (activas + asentables).
  const codigos = Array.from(new Set(asiento.map((l) => l.cuenta).filter((x) => x && x !== "(sin cuenta)")));
  if (codigos.length !== new Set(asiento.map((l) => l.cuenta)).size) return { error: "hay líneas sin cuenta contable" };
  const { rows: pcs } = await client.query<{ id: string; cuenta: string }>(
    `SELECT id, cuenta FROM ${tPC} WHERE empresa_id=$1::uuid AND activo=true AND asentable=true AND cuenta = ANY($2::text[])`,
    [empresaId, codigos]
  );
  const idPorCodigo = new Map(pcs.map((r) => [r.cuenta, r.id]));
  const faltan = codigos.filter((c2) => !idPorCodigo.has(c2));
  if (faltan.length) return { error: `cuentas no válidas o no asentables: ${faltan.join(", ")}` };

  const lineas: AsientoLineaInput[] = asiento.map((l) => ({
    cuenta_contable_id: idPorCodigo.get(l.cuenta)!,
    descripcion: l.detalle,
    debe: l.debe,
    haber: l.haber,
    documento_tipo: "compra",
    documento_id: compraId,
  }));

  return { lineas, fecha: c.fecha, glosa: detalle, moneda, tipo_cambio: Number(c.cotizacion) || 1 };
}

/** Contabiliza una compra (idempotente). Crea el asiento si aún no existe. Best-effort. */
export async function contabilizarCompra(schemaRaw: string, empresaId: string, compraId: string, createdBy: string | null): Promise<ContabCompraResult> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tC = quoteSchemaTable(schema, "libro_compras");
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ estado: string | null; asiento_contable_id: string | null }>(
      `SELECT estado, asiento_contable_id FROM ${tC} WHERE id=$1::uuid AND empresa_id=$2::uuid FOR UPDATE`,
      [compraId, empresaId]
    );
    const compra = rows[0];
    if (!compra) { await client.query("ROLLBACK"); return { status: "omitido", motivo: "compra inexistente" }; }
    if (String(compra.estado) === "anulada") { await client.query("ROLLBACK"); return { status: "omitido", motivo: "anulada" }; }
    if (compra.asiento_contable_id) { await client.query("ROLLBACK"); return { status: "ya_contabilizado", asientoId: compra.asiento_contable_id }; }

    const built = await construirAsientoCompra(client, schema, empresaId, compraId);
    if ("error" in built) { await client.query("ROLLBACK"); return { status: "omitido", motivo: built.error }; }

    const asiento = await generarAsientoEnTx(client, schema, empresaId, {
      origen_tipo: "compra", origen_id: compraId, evento_origen: "alta",
      fecha_contable: built.fecha, glosa: `Compra ${built.glosa}`.slice(0, 300),
      moneda: built.moneda === "USD" ? "USD" : built.moneda === "BOB" ? "BOB" : "PYG",
      tipo_cambio: built.tipo_cambio, lineas: built.lineas, createdBy,
    });
    await client.query(`UPDATE ${tC} SET asiento_contable_id=$3::uuid WHERE id=$1::uuid AND empresa_id=$2::uuid`, [compraId, empresaId, asiento.id]);
    await client.query("COMMIT");
    return { status: "contabilizado", asientoId: asiento.id };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    return { status: "error", motivo: e instanceof Error ? e.message : "Error al contabilizar la compra." };
  } finally {
    client.release();
  }
}

/** Revierte el asiento de una compra (al anular, o antes de recontabilizar tras una edición). Best-effort. */
export async function revertirAsientoCompra(schemaRaw: string, empresaId: string, compraId: string, createdBy: string | null): Promise<ContabCompraResult> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tC = quoteSchemaTable(schema, "libro_compras");
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ asiento_contable_id: string | null }>(
      `SELECT asiento_contable_id FROM ${tC} WHERE id=$1::uuid AND empresa_id=$2::uuid FOR UPDATE`,
      [compraId, empresaId]
    );
    const asientoId = rows[0]?.asiento_contable_id;
    if (!asientoId) { await client.query("ROLLBACK"); return { status: "omitido", motivo: "sin asiento" }; }

    const orig = await getAsientoConDetalles(client, schema, empresaId, asientoId);
    if (!orig) { await client.query("ROLLBACK"); return { status: "omitido", motivo: "asiento no encontrado" }; }

    const inversas: AsientoLineaInput[] = orig.detalles.map((d) => ({
      cuenta_contable_id: d.cuenta_contable_id, proveedor_id: d.proveedor_id ?? null,
      descripcion: d.descripcion ?? null, debe: Number(d.haber) || 0, haber: Number(d.debe) || 0,
      documento_tipo: "compra", documento_id: compraId,
    }));
    await generarAsientoEnTx(client, schema, empresaId, {
      origen_tipo: "reversion", origen_id: compraId, evento_origen: `rev:${asientoId}`,
      fecha_contable: orig.cabecera.fecha_contable, glosa: `Reversión ${orig.cabecera.glosa ?? "compra"}`.slice(0, 300),
      moneda: orig.cabecera.moneda, tipo_cambio: Number(orig.cabecera.tipo_cambio) || 1,
      lineas: inversas, createdBy, asiento_original_id: asientoId,
    });
    // Se libera el id: la compra queda lista para recontabilizar (edición) o sin asiento (anulada).
    await client.query(`UPDATE ${tC} SET asiento_contable_id=NULL WHERE id=$1::uuid AND empresa_id=$2::uuid`, [compraId, empresaId]);
    await client.query("COMMIT");
    return { status: "contabilizado", asientoId };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    return { status: "error", motivo: e instanceof Error ? e.message : "Error al revertir el asiento." };
  } finally {
    client.release();
  }
}

/** Resincroniza el asiento tras una edición: revierte el anterior (si había) y crea el nuevo. Best-effort. */
export async function recontabilizarCompra(schema: string, empresaId: string, compraId: string, createdBy: string | null): Promise<ContabCompraResult> {
  await revertirAsientoCompra(schema, empresaId, compraId, createdBy).catch(() => null);
  return contabilizarCompra(schema, empresaId, compraId, createdBy);
}

export interface SweepComprasResult { contabilizadas: number; ya: number; omitidas: number; error: number; errores: { id: string; motivo: string }[] }

/** Backfill idempotente: contabiliza toda compra vigente sin asiento. */
export async function sweepContabilizarCompras(schemaRaw: string, empresaId: string, createdBy: string | null): Promise<SweepComprasResult> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tC = quoteSchemaTable(schema, "libro_compras");
  const res: SweepComprasResult = { contabilizadas: 0, ya: 0, omitidas: 0, error: 0, errores: [] };
  const { rows } = await pool().query<{ id: string }>(
    `SELECT id FROM ${tC} WHERE empresa_id=$1::uuid AND COALESCE(estado,'')<>'anulada' AND asiento_contable_id IS NULL ORDER BY fecha ASC`,
    [empresaId]
  );
  for (const r of rows) {
    const x = await contabilizarCompra(schema, empresaId, r.id, createdBy);
    if (x.status === "contabilizado") res.contabilizadas++;
    else if (x.status === "ya_contabilizado") res.ya++;
    else if (x.status === "error") { res.error++; res.errores.push({ id: r.id, motivo: x.motivo ?? "" }); }
    else res.omitidas++;
  }
  return res;
}
