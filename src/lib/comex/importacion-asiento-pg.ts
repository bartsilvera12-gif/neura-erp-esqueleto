import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import {
  generarAsientoEnTx,
  getConfigContable,
  ContabilidadError,
  type AsientoLineaInput,
  type AsientoRef,
} from "@/lib/contabilidad/asientos-pg";
import { gastoCostoGuaranies, gastoEnGuaranies } from "@/lib/comex/gastos";

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

/**
 * Asiento contable de una importación, al pasar a "Cerrada". Capitaliza el costo
 * en el inventario y deja del otro lado lo que se debe:
 *
 *   DEBE   Inventario / Mercadería   (mercadería + gastos sin IVA)
 *   DEBE   IVA Crédito 10%           (IVA de los gastos que lo llevan)
 *   HABER  Proveedor del exterior    (valor de la mercadería)
 *   HABER  Gastos por pagar          (cada gasto con su cuenta, 100% con IVA)
 *
 * Respeta la separación costo capitalizable / IVA recuperable, no duplica IVA ni
 * gastos (es el único asiento que los contabiliza), y es idempotente por
 * (origen_tipo='importacion', origen_id, evento_origen='cierre'). Si algún
 * importe no se puede clasificar (falta una cuenta), lanza ContabilidadError con
 * el motivo y NO genera nada.
 */
export async function contabilizarImportacionCierre(
  schemaRaw: string,
  empresaId: string,
  importacionId: string,
  fechaContable: string,
  createdBy: string | null
): Promise<AsientoRef | null> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const config = await getConfigContable(schema, empresaId);

  // Si la empresa todavía no configuró la contabilidad (no hay fila de
  // configuración contable), la importación se puede cerrar igual: no se genera
  // asiento. Cuando activen la contabilidad, los asientos se arman normalmente.
  if (!config) return null;

  const tImp = quoteSchemaTable(schema, "importaciones");
  const tItems = quoteSchemaTable(schema, "importacion_items");
  const tGastos = quoteSchemaTable(schema, "comex_gastos");
  const tPC = quoteSchemaTable(schema, "plan_cuentas");

  const client = await pool().connect();
  try {
    await client.query("BEGIN");

    const { rows: ir } = await client.query<{ numero: string; proveedor_id: string | null; tipo_cambio: string; moneda: string }>(
      `SELECT numero, proveedor_id, tipo_cambio, moneda FROM ${tImp} WHERE id=$1::uuid AND empresa_id=$2::uuid FOR UPDATE`,
      [importacionId, empresaId]
    );
    const imp = ir[0];
    if (!imp) throw new ContabilidadError("Importación no encontrada.", 404);
    const tc = Number(imp.tipo_cambio) > 0 ? Number(imp.tipo_cambio) : 1;

    // Mercadería en Gs: lo que facturó el proveedor (Σ subtotal, llevado a Gs).
    const { rows: items } = await client.query<{ subtotal: string | null; precio_unitario: string | null; cantidad: string | null; moneda: string | null }>(
      `SELECT subtotal, precio_unitario, cantidad, moneda FROM ${tItems} WHERE importacion_id=$1::uuid AND empresa_id=$2::uuid`,
      [importacionId, empresaId]
    );
    let mercaderiaGs = 0;
    for (const it of items) {
      const sub = Number(it.subtotal) || (Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0);
      mercaderiaGs += (it.moneda ?? imp.moneda) === "PYG" ? sub : sub * tc;
    }
    mercaderiaGs = Math.round(mercaderiaGs);

    // Gastos: costo sin IVA (capitaliza) e IVA (crédito fiscal), y el pago con
    // IVA agrupado por la cuenta contable de cada gasto (contrapartida al haber).
    const { rows: gastos } = await client.query<{ monto: string; tipo_cambio: string; lleva_iva: boolean; cuenta_codigo: string | null; tipo: string }>(
      `SELECT monto, tipo_cambio, lleva_iva, cuenta_codigo, tipo FROM ${tGastos}
        WHERE origen_tipo='IMPORTACION' AND origen_id=$1::uuid AND empresa_id=$2::uuid`,
      [importacionId, empresaId]
    );
    let gastosCostoGs = 0;
    let ivaGs = 0;
    const porCuenta = new Map<string, number>();
    const sinCuenta = new Set<string>();
    for (const g of gastos) {
      const base = { monto: Number(g.monto), tipo_cambio: Number(g.tipo_cambio) };
      const pago = gastoEnGuaranies(base);
      const costo = gastoCostoGuaranies({ ...base, lleva_iva: g.lleva_iva });
      if (pago <= 0) continue;
      gastosCostoGs += costo;
      ivaGs += pago - costo;
      const cod = (g.cuenta_codigo ?? "").trim();
      if (!cod) { sinCuenta.add(g.tipo); continue; }
      porCuenta.set(cod, (porCuenta.get(cod) ?? 0) + pago);
    }

    const inventarioGs = mercaderiaGs + gastosCostoGs;
    // Sin nada que capitalizar no hay asiento (importación sin costos cargados).
    if (inventarioGs <= 0) {
      await client.query("ROLLBACK");
      return null;
    }

    // Validaciones: si algo no se puede clasificar, se bloquea con el motivo.
    if (sinCuenta.size)
      throw new ContabilidadError(`Asignales la cuenta contable a estos gastos antes de cerrar: ${[...sinCuenta].join(", ")}.`);
    if (!config?.cuenta_inventario_id)
      throw new ContabilidadError("Configurá la cuenta de Inventario / Mercadería en Configuración Contable.");
    if (mercaderiaGs > 0 && !config?.cuenta_proveedores_id)
      throw new ContabilidadError("Configurá la cuenta general de Proveedores en Configuración Contable.");
    if (ivaGs > 0 && !config?.cuenta_iva_credito_10_id)
      throw new ContabilidadError("Configurá la cuenta de IVA Crédito 10% en Configuración Contable.");

    // cuenta_codigo (texto) → id del plan de cuentas (activa + asentable).
    const codigos = [...porCuenta.keys()];
    const codToId = new Map<string, string>();
    if (codigos.length) {
      const { rows: cs } = await client.query<{ id: string; cuenta: string }>(
        `SELECT id, cuenta FROM ${tPC} WHERE empresa_id=$1::uuid AND activo=true AND asentable=true AND cuenta = ANY($2::text[])`,
        [empresaId, codigos]
      );
      for (const c of cs) codToId.set(c.cuenta, c.id);
      const faltan = codigos.filter((c) => !codToId.has(c));
      if (faltan.length)
        throw new ContabilidadError(`Estas cuentas de gastos no existen o no son imputables en el Plan de Cuentas: ${faltan.join(", ")}.`);
    }

    const docTipo = "Importación";
    const lineas: AsientoLineaInput[] = [
      { cuenta_contable_id: config.cuenta_inventario_id, descripcion: "Inventario / Mercadería", debe: inventarioGs, haber: 0, documento_tipo: docTipo, documento_id: importacionId },
    ];
    if (ivaGs > 0)
      lineas.push({ cuenta_contable_id: config.cuenta_iva_credito_10_id!, descripcion: "IVA Crédito 10%", debe: ivaGs, haber: 0, documento_tipo: docTipo, documento_id: importacionId });
    if (mercaderiaGs > 0)
      lineas.push({ cuenta_contable_id: config.cuenta_proveedores_id!, proveedor_id: imp.proveedor_id, descripcion: "Proveedor del exterior", debe: 0, haber: mercaderiaGs, documento_tipo: docTipo, documento_id: importacionId });
    for (const [cod, monto] of porCuenta) {
      if (monto <= 0) continue;
      lineas.push({ cuenta_contable_id: codToId.get(cod)!, descripcion: "Gastos de importación por pagar", debe: 0, haber: monto, documento_tipo: docTipo, documento_id: importacionId });
    }

    const asiento = await generarAsientoEnTx(client, schema, empresaId, {
      origen_tipo: "importacion",
      origen_id: importacionId,
      evento_origen: "cierre",
      fecha_contable: fechaContable,
      glosa: `Importación ${imp.numero}`,
      moneda: "PYG",
      tipo_cambio: 1,
      lineas,
      createdBy,
    });

    await client.query("COMMIT");
    return asiento;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}
