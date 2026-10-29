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

/** Arma el cuerpo que entiende `guardarCompra` a partir de un gasto con IVA. */
function facturaBodyDeGasto(g: GastoParaFactura, tipoId: string): Record<string, unknown> {
  const pct = g.iva_porcentaje === 5 ? 5 : 10;
  const detalle = [g.tipo, g.descripcion].filter(Boolean).join(" · ").slice(0, 300) || "Gasto de importación";
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
    impacta: "SOLO_IVA",
    explicacion: detalle,
    lineas: [
      {
        cuenta_codigo: g.cuenta_codigo,
        explicacion: detalle,
        exentas: 0,
        gravadas: g.monto,
        iva_porcentaje: pct,
        imputa_iva: true,
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
): Promise<{ compraId: string; numeroControl: string }> {
  const falta = faltaParaFactura(g);
  if (falta) throw new ErrorValidacion(`Para mandar el gasto al Libro de Compras ${falta}.`);
  const tipoId = await tipoCompraCreditoId(sb, auth.empresa_id);
  const r = await guardarCompra(sb, auth, facturaBodyDeGasto(g, tipoId));
  return { compraId: r.id, numeroControl: r.numero_control };
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
