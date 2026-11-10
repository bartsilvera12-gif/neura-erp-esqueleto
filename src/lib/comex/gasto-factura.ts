/**
 * Puente entre un gasto de importación/exportación y el Libro de Compras.
 *
 * Cuando un gasto LLEVA IVA, además de cargarse como gasto de la operación se
 * registra como factura en el Libro de Compras (para el crédito fiscal y la
 * cuenta contable). Se arma como "COMPRA CRÉDITO" con una sola cuota: así queda
 * como cuenta por pagar al proveedor y, desde la pantalla de gastos, se puede
 * pagar con las 3 formas (efectivo = caja, transferencia = banco, o dejarla sin
 * pagar), descontando el saldo real igual que cualquier compra.
 *
 * No contabiliza nada: el asiento real de la importación se genera al cerrarla
 * (ver importacion-asiento-pg). Esto es solo el registro en el Libro de Compras.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import type { UsuarioConEmpresaYRol } from "@/lib/middleware/auth";
import { ErrorValidacion, guardarCompra } from "@/lib/compras-libro/server";
import { anularPago, pagosVigentes } from "@/lib/tesoreria/server";

/** Código del tipo de comprobante "COMPRA CRÉDITO" (ver seed de compra_tipos_comprobante). */
const CODIGO_COMPRA_CREDITO = 2;

export interface GastoParaFactura {
  fecha: string;
  tipo: string | null;
  descripcion: string | null;
  proveedor_nombre: string | null;
  proveedor_ruc: string | null;
  comprobante: string | null;
  timbrado: string | null;
  cuenta_codigo: string | null;
  monto: number;
  moneda: string;
  tipo_cambio: number;
  iva_porcentaje: number | null;
}

/** Valida que el gasto con IVA tenga todo lo que la factura necesita. Devuelve el motivo o null. */
export function faltaParaFactura(g: GastoParaFactura): string | null {
  if (!g.proveedor_nombre?.trim()) return "falta el PROVEEDOR";
  if (!g.proveedor_ruc?.trim()) return "falta el RUC del proveedor";
  if (!g.comprobante?.trim()) return "falta el N° de COMPROBANTE";
  if (!g.timbrado?.trim()) return "falta el TIMBRADO";
  if (!g.cuenta_codigo?.trim()) return "falta la CUENTA contable";
  return null;
}

/** Id del tipo "COMPRA CRÉDITO" activo de la empresa (o lanza con un motivo claro). */
async function tipoCompraCreditoId(sb: AppSupabaseClient, empresaId: string): Promise<string> {
  const { data } = await sb
    .from("compra_tipos_comprobante")
    .select("id, activo")
    .eq("empresa_id", empresaId)
    .eq("codigo", CODIGO_COMPRA_CREDITO)
    .eq("uso", "COMPRA")
    .maybeSingle();
  const tipo = data as { id: string; activo: boolean } | null;
  if (!tipo || !tipo.activo)
    throw new ErrorValidacion('Falta el tipo de comprobante "COMPRA CRÉDITO" activo en Compras → Tipos de comprobante.');
  return tipo.id;
}

/** Arma el cuerpo que entiende `guardarCompra` a partir de un gasto (con IVA o exento). */
function facturaBodyDeGasto(g: GastoParaFactura, tipoId: string): Record<string, unknown> {
  const detalle = [g.tipo, g.descripcion].filter(Boolean).join(" · ").slice(0, 300) || "Gasto de importación";
  // Si el gasto no lleva IVA, la factura va al libro como EXENTA.
  const esExento = g.iva_porcentaje == null || g.iva_porcentaje === 0;
  const pct = g.iva_porcentaje === 5 ? 5 : 10;
  return {
    tipo_id: tipoId,
    seccion: "COMERCIO_EXTERIOR",
    fecha: g.fecha,
    nro_comprobante: g.comprobante,
    timbrado: g.timbrado,
    es_electronica: false,
    proveedor_nombre: g.proveedor_nombre,
    proveedor_ruc: g.proveedor_ruc,
    moneda: g.moneda,
    cotizacion: g.tipo_cambio,
    impacta: esExento ? "NO_IMPUTA" : "SOLO_IVA",
    explicacion: detalle,
    lineas: [
      {
        cuenta_codigo: g.cuenta_codigo,
        explicacion: detalle,
        exentas: esExento ? g.monto : 0,
        gravadas: esExento ? 0 : g.monto,
        iva_porcentaje: esExento ? 0 : pct,
        imputa_iva: !esExento,
        formulario: "Form120-R6-a",
      },
    ],
    // Una sola cuota = cuenta por pagar al proveedor (se paga desde la pantalla de gastos).
    cuotas_detalle: [{ vencimiento: g.fecha, monto: g.monto, pagado: 0 }],
  };
}

/**
 * Crea la factura del gasto en el Libro de Compras y devuelve su id.
 * Lanza ErrorValidacion con un motivo claro si falta algún dato o el comprobante
 * ya está cargado.
 */
export async function crearFacturaDeGasto(
  sb: AppSupabaseClient,
  auth: UsuarioConEmpresaYRol,
  g: GastoParaFactura
): Promise<{ compraId: string; numeroControl: string; existed: boolean }> {
  const falta = faltaParaFactura(g);
  if (falta) throw new ErrorValidacion(`Para mandar el gasto al Libro de Compras ${falta}.`);
  // Idempotencia: si ya existe una factura DE COMERCIO EXTERIOR con el mismo
  // (empresa, ruc, nro_comprobante, moneda, total), se reutiliza. Esto evita
  // que re-importar la plantilla de gastos de una importación falle con
  // "Ese comprobante de ese proveedor ya está cargado" cuando las facturas se
  // habían cargado en un intento anterior y quedaron sin enlazar por rollback.
  // Se exige sección=COMERCIO_EXTERIOR + misma moneda + mismo total para no
  // reutilizar por azar una compra manual vieja de Showroom con el mismo RUC
  // y número de comprobante (talonarios paraguayos pueden repetir numeración).
  const rucN = (g.proveedor_ruc ?? "").trim();
  const nro = (g.comprobante ?? "").trim();
  if (rucN && nro) {
    const { data: prev } = await sb
      .from("libro_compras")
      .select("id, numero_control, moneda, total, estado")
      .eq("empresa_id", auth.empresa_id)
      .eq("seccion", "COMERCIO_EXTERIOR")
      .eq("proveedor_ruc", rucN)
      .eq("nro_comprobante", nro)
      .eq("moneda", g.moneda)
      .neq("estado", "anulada")
      .order("created_at", { ascending: false })
      .limit(5);
    const candidatos = (prev ?? []) as { id: string; numero_control: string; total: number }[];
    const tolerancia = g.moneda === "PYG" ? 1 : 0.01;
    const match = candidatos.find((c) => Math.abs(Number(c.total) - g.monto) <= tolerancia);
    if (match) return { compraId: match.id, numeroControl: match.numero_control, existed: true };
  }
  const tipoId = await tipoCompraCreditoId(sb, auth.empresa_id);
  try {
    const r = await guardarCompra(sb, auth, facturaBodyDeGasto(g, tipoId));
    return { compraId: r.id, numeroControl: r.numero_control, existed: false };
  } catch (e) {
    // Fallback: si el INSERT choca contra el UNIQUE (ya hay una factura con el
    // mismo tipo + ruc + timbrado + nro, aunque el monto cambie), reutilizamos
    // la que ya está en COMERCIO_EXTERIOR y moneda coincidente. Evita el
    // "Ese comprobante de ese proveedor ya está cargado" cuando el cliente
    // corrige el monto del Excel y re-importa.
    const msg = e instanceof Error ? e.message : String(e);
    const duplicado = /ya está cargado|23505|comprobante_uq|duplicate key/i.test(msg);
    if (duplicado && rucN && nro) {
      const { data: alt } = await sb
        .from("libro_compras")
        .select("id, numero_control")
        .eq("empresa_id", auth.empresa_id)
        .eq("seccion", "COMERCIO_EXTERIOR")
        .eq("proveedor_ruc", rucN)
        .eq("nro_comprobante", nro)
        .eq("moneda", g.moneda)
        .neq("estado", "anulada")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const existente = alt as { id: string; numero_control: string } | null;
      if (existente) return { compraId: existente.id, numeroControl: existente.numero_control, existed: true };
    }
    throw e;
  }
}

/**
 * Actualiza la factura ya enlazada a un gasto (cuando se edita el gasto). Si la
 * cuota ya tiene pagos que no cierran con el nuevo monto, `guardarCompra` lo
 * bloquea con un motivo claro.
 */
export async function actualizarFacturaDeGasto(
  sb: AppSupabaseClient,
  auth: UsuarioConEmpresaYRol,
  compraId: string,
  g: GastoParaFactura
): Promise<void> {
  const falta = faltaParaFactura(g);
  if (falta) throw new ErrorValidacion(`Para mandar el gasto al Libro de Compras ${falta}.`);
  const tipoId = await tipoCompraCreditoId(sb, auth.empresa_id);
  await guardarCompra(sb, auth, facturaBodyDeGasto(g, tipoId), compraId);
}

/**
 * Anula la factura de un gasto (al borrar el gasto o al sacarle el IVA): devuelve
 * la plata de los pagos a la caja / banco y la marca anulada. No la borra.
 */
export async function anularFacturaDeGasto(
  sb: AppSupabaseClient,
  auth: UsuarioConEmpresaYRol,
  compraId: string,
  motivo: string
): Promise<void> {
  const emp = auth.empresa_id;
  const { data } = await sb.from("libro_compras").select("estado").eq("empresa_id", emp).eq("id", compraId).maybeSingle();
  if ((data as { estado: string } | null)?.estado !== "registrada") return;
  for (const pg of await pagosVigentes(sb, emp, compraId)) await anularPago(sb, auth, pg.id, `Factura anulada: ${motivo}`, compraId);
  await sb
    .from("libro_compras")
    .update({ estado: "anulada", anulada_motivo: motivo.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("empresa_id", emp)
    .eq("id", compraId)
    .eq("estado", "registrada");
}
