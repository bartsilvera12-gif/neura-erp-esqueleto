/**
 * Guardado de un comprobante del libro de compras (alta y edición):
 * valida, calcula totales y reemplaza renglones y cuotas.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import type { UsuarioConEmpresaYRol } from "@/lib/middleware/auth";
import { diferencias, esUuid, nombreUsuario, registrarHistorial } from "@/lib/comex/server";
import { leerCdc, totales, type LineaCalc } from "./calculo";

export const COMPRA_COLS =
  "id, numero_control, fecha, tipo_id, tipo_codigo, tipo_nombre, condicion, nro_comprobante, proveedor_id, proveedor_nombre, proveedor_ruc, " +
  "timbrado, es_electronica, cdc, moneda, cotizacion, cuotas, explicacion, impacta, retencion_iva, retencion_renta, total_exentas, " +
  "total_gravado10, total_gravado5, iva10, iva5, total, estado, anulada_motivo, created_by_nombre, updated_by_nombre, created_at, updated_at";

const MONEDAS = new Set(["PYG", "USD", "BOB"]);
const IMPACTA = new Set(["SOLO_IVA", "IVA_IRE", "SOLO_IRE", "NO_IMPUTA"]);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const txt = (v: unknown, max = 300) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

export class ErrorValidacion extends Error {}

/** Número de comprobante: 001-001-0000001 (o tal cual si es un recibo sin formato). */
function normalizarNro(v: string): string {
  const d = v.replace(/\s/g, "");
  const m = d.match(/^(\d{1,3})-?(\d{1,3})-?(\d{1,7})$/);
  return m ? `${m[1].padStart(3, "0")}-${m[2].padStart(3, "0")}-${m[3].padStart(7, "0")}` : d;
}

export async function guardarCompra(
  sb: AppSupabaseClient,
  auth: UsuarioConEmpresaYRol,
  body: Record<string, unknown>,
  id?: string
): Promise<{ id: string; numero_control: string }> {
  const emp = auth.empresa_id;

  // Tipo de comprobante (define contado/crédito, nota de crédito y la cuenta del asiento).
  const tipoId = String(body.tipo_id ?? "");
  if (!esUuid(tipoId)) throw new ErrorValidacion("Elegí el tipo de comprobante.");
  const { data: tipoData } = await sb
    .from("compra_tipos_comprobante")
    .select("id, codigo, nombre, uso, condicion, activo")
    .eq("empresa_id", emp)
    .eq("id", tipoId)
    .maybeSingle();
  const tipo = tipoData as { id: string; codigo: number; nombre: string; uso: string; condicion: "CONTADO" | "CREDITO"; activo: boolean } | null;
  if (!tipo || !tipo.activo) throw new ErrorValidacion("Ese tipo de comprobante no existe o está desactivado.");
  if (tipo.uso !== "COMPRA") throw new ErrorValidacion("Ese tipo de comprobante es de ventas, no de compras.");

  const fecha = String(body.fecha ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new ErrorValidacion("Falta la fecha.");
  const nro = normalizarNro(String(body.nro_comprobante ?? ""));
  if (!nro) throw new ErrorValidacion("Falta el número de comprobante.");
  const proveedorNombre = txt(body.proveedor_nombre, 200);
  if (!proveedorNombre) throw new ErrorValidacion("Falta el proveedor.");
  const moneda = String(body.moneda ?? "PYG").toUpperCase();
  if (!MONEDAS.has(moneda)) throw new ErrorValidacion("Moneda no soportada.");
  const cotizacion = moneda === "PYG" ? 1 : num(body.cotizacion);
  if (moneda !== "PYG" && !(cotizacion > 1)) throw new ErrorValidacion(`Cargá la cotización del ${moneda} a guaraníes.`);

  const esElectronica = body.es_electronica === true;
  let cdc: string | null = null;
  if (body.cdc) {
    const l = leerCdc(String(body.cdc));
    if (!l.ok) throw new ErrorValidacion(l.error);
    cdc = l.cdc;
  }
  const timbrado = txt(body.timbrado, 20);
  if (tipo.codigo !== 12 && !timbrado) throw new ErrorValidacion("Falta el timbrado del comprobante.");

  const lineasRaw = Array.isArray(body.lineas) ? (body.lineas as Record<string, unknown>[]) : [];
  const lineas: (LineaCalc & { formulario: string | null })[] = lineasRaw
    .map((l) => {
      const pct = Number(l.iva_porcentaje);
      return {
        cuenta_codigo: txt(l.cuenta_codigo, 40),
        centro_costo: txt(l.centro_costo, 40),
        programa: txt(l.programa, 40),
        explicacion: txt(l.explicacion, 300),
        exentas: num(l.exentas),
        gravadas: num(l.gravadas),
        iva_porcentaje: (pct === 5 || pct === 10 ? pct : 0) as 0 | 5 | 10,
        imputa_iva: l.imputa_iva !== false,
        formulario: txt(l.formulario, 40),
      };
    })
    .filter((l) => l.exentas || l.gravadas);
  if (!lineas.length) throw new ErrorValidacion("Cargá al menos un renglón con monto.");
  if (lineas.some((l) => l.exentas < 0 || l.gravadas < 0)) throw new ErrorValidacion("Los montos no pueden ser negativos.");
  if (lineas.some((l) => !l.cuenta_codigo)) throw new ErrorValidacion("Todos los renglones necesitan la cuenta contable.");
  const t = totales(lineas, moneda);

  const retIva = num(body.retencion_iva);
  const retRenta = num(body.retencion_renta);
  if (retIva < 0 || retRenta < 0) throw new ErrorValidacion("Las retenciones no pueden ser negativas.");
  if (retIva + retRenta > t.total) throw new ErrorValidacion("Las retenciones no pueden superar el total.");

  // Cuotas: solo a crédito; tienen que sumar el total (menos retenciones).
  const cuotasRaw = tipo.condicion === "CREDITO" && Array.isArray(body.cuotas_detalle) ? (body.cuotas_detalle as Record<string, unknown>[]) : [];
  const cuotas = cuotasRaw.map((c, i) => ({
    nro: i + 1,
    pagare: txt(c.pagare, 40),
    vencimiento: String(c.vencimiento ?? "").slice(0, 10),
    monto: num(c.monto),
    pagado: num(c.pagado),
  }));
  if (tipo.condicion === "CREDITO") {
    if (!cuotas.length) throw new ErrorValidacion("Una compra a crédito necesita al menos una cuota.");
    if (cuotas.some((c) => !/^\d{4}-\d{2}-\d{2}$/.test(c.vencimiento))) throw new ErrorValidacion("Todas las cuotas necesitan fecha de vencimiento.");
    if (cuotas.some((c) => c.monto <= 0 || c.pagado < 0 || c.pagado > c.monto)) throw new ErrorValidacion("Revisá los montos de las cuotas.");
    const suma = cuotas.reduce((s, c) => s + c.monto, 0);
    const esperado = t.total - retIva - retRenta;
    if (Math.abs(suma - esperado) > (moneda === "PYG" ? 1 : 0.01))
      throw new ErrorValidacion(`Las cuotas suman ${suma.toLocaleString("es-PY")} y deberían sumar ${esperado.toLocaleString("es-PY")}.`);
  }

  const datos = {
    fecha,
    tipo_id: tipo.id,
    tipo_codigo: tipo.codigo,
    tipo_nombre: tipo.nombre,
    condicion: tipo.condicion,
    nro_comprobante: nro,
    proveedor_id: esUuid(body.proveedor_id) ? body.proveedor_id : null,
    proveedor_nombre: proveedorNombre,
    proveedor_ruc: txt(body.proveedor_ruc, 20),
    timbrado,
    es_electronica: esElectronica || !!cdc,
    cdc,
    moneda,
    cotizacion,
    cuotas: cuotas.length,
    explicacion: txt(body.explicacion, 300),
    impacta: IMPACTA.has(String(body.impacta)) ? String(body.impacta) : "SOLO_IVA",
    retencion_iva: retIva,
    retencion_renta: retRenta,
    total_exentas: t.exentas,
    total_gravado10: t.gravado10,
    total_gravado5: t.gravado5,
    iva10: t.iva10,
    iva5: t.iva5,
    total: t.total,
    updated_at: new Date().toISOString(),
    updated_by_nombre: nombreUsuario(auth),
  };

  let compraId = id ?? "";
  let numeroControl = "";
  let antes: Record<string, unknown> | null = null;
  if (id) {
    const prev = await sb.from("libro_compras").select(COMPRA_COLS).eq("empresa_id", emp).eq("id", id).maybeSingle();
    antes = prev.data as unknown as Record<string, unknown> | null;
    if (!antes) throw new ErrorValidacion("El comprobante no existe.");
    if (antes.estado === "anulada") throw new ErrorValidacion("El comprobante está anulado; no se puede modificar.");
    const { error } = await sb.from("libro_compras").update(datos).eq("empresa_id", emp).eq("id", id);
    if (error) throw traducir(error);
    numeroControl = String(antes.numero_control);
  } else {
    // Número interno LC-000001 (reintenta si dos personas cargan a la vez).
    for (let intento = 0; intento < 5 && !compraId; intento++) {
      const { data: ult } = await sb
        .from("libro_compras")
        .select("numero_control")
        .eq("empresa_id", emp)
        .order("numero_control", { ascending: false })
        .limit(1);
      const m = (((ult ?? [])[0] as { numero_control?: string } | undefined)?.numero_control ?? "").match(/(\d+)$/);
      const nc = `LC-${String((m ? Number(m[1]) : 0) + 1 + intento).padStart(6, "0")}`;
      const { data, error } = await sb
        .from("libro_compras")
        .insert({ ...datos, empresa_id: emp, numero_control: nc, created_by_nombre: nombreUsuario(auth) })
        .select("id, numero_control")
        .single();
      if (error) {
        if (error.code === "23505" && /numero_uk/.test(error.message)) continue;
        throw traducir(error);
      }
      compraId = (data as { id: string }).id;
      numeroControl = (data as { numero_control: string }).numero_control;
    }
    if (!compraId) throw new Error("No se pudo asignar el número interno. Probá de nuevo.");
  }

  // Renglones y cuotas se reemplazan completos.
  await sb.from("libro_compras_lineas").delete().eq("empresa_id", emp).eq("compra_id", compraId);
  const insL = await sb
    .from("libro_compras_lineas")
    .insert(lineas.map((l, i) => ({ ...l, empresa_id: emp, compra_id: compraId, orden: i })));
  if (insL.error) throw new Error(insL.error.message);
  await sb.from("libro_compras_cuotas").delete().eq("empresa_id", emp).eq("compra_id", compraId);
  if (cuotas.length) {
    const insC = await sb.from("libro_compras_cuotas").insert(cuotas.map((c) => ({ ...c, empresa_id: emp, compra_id: compraId })));
    if (insC.error) throw new Error(insC.error.message);
  }

  await registrarHistorial(
    sb,
    auth,
    "COMPRA",
    compraId,
    id ? "MODIFICAR" : "CREAR",
    id && antes
      ? { cambios: diferencias(antes, datos) }
      : { numero: numeroControl, proveedor: proveedorNombre, comprobante: `${tipo.nombre} ${nro}`, total: t.total, moneda }
  );
  return { id: compraId, numero_control: numeroControl };
}

function traducir(error: { code?: string; message: string }): Error {
  if (error.code === "23505" && /cdc/.test(error.message)) return new ErrorValidacion("Ese CDC ya está cargado en otro comprobante.");
  if (error.code === "23505") return new ErrorValidacion("Ese comprobante de ese proveedor ya está cargado.");
  return new Error(error.message);
}
