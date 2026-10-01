/**
 * Deshace una venta devolviendo el stock que descontó.
 *
 * Lo usa el borrado de una venta y la anulación de la factura local que la
 * originó: factura y venta son el mismo hecho, así que se deshacen juntas.
 *
 * El stock a devolver sale de los MOVIMIENTOS de la venta, no de sus ítems:
 * las líneas escritas a mano y los productos que no controlan stock nunca
 * descontaron, así que tampoco tienen que sumar al deshacerla.
 *
 * `modo`:
 *  - "borrar": la venta se elimina (error de carga, sin factura de por medio).
 *  - "anular": la venta queda con estado "anulada". Se usa cuando tenía factura:
 *    el arqueo ya la ignora y no se pierde el rastro de una venta facturada.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { sumarStockDeposito } from "@/lib/comex/stock-deposito";

export async function anularVentaCompleta(
  sb: AppSupabaseClient,
  empresaId: string,
  ventaId: string,
  modo: "borrar" | "anular" = "borrar"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: venta, error: eV } = await sb.from("ventas").select("id, estado").eq("empresa_id", empresaId).eq("id", ventaId).maybeSingle();
  if (eV) return { ok: false, error: eV.message };
  if (!venta) return { ok: false, error: "Venta no encontrada." };
  // Si ya estaba anulada, el stock ya se devolvió: no se devuelve dos veces,
  // pero si piden borrarla igual se borra.
  const yaAnulada = (venta as { estado: string | null }).estado === "anulada";

  const { data: movs, error: eM } = await sb
    .from("movimientos_inventario")
    .select("id, producto_id, cantidad, ubicacion_origen_id")
    .eq("empresa_id", empresaId)
    .eq("venta_id", ventaId)
    .eq("tipo", "SALIDA");
  if (eM) return { ok: false, error: eM.message };

  for (const m of (yaAnulada ? [] : (movs ?? [])) as { id: string; producto_id: string | null; cantidad: number; ubicacion_origen_id: string | null }[]) {
    const cantidad = Number(m.cantidad) || 0;
    if (!m.producto_id || cantidad <= 0) continue;
    // Primero el depósito (con el total sin tocar), después el total.
    if (m.ubicacion_origen_id) {
      try {
        await sumarStockDeposito(sb, empresaId, m.producto_id, m.ubicacion_origen_id, cantidad);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "No se pudo devolver el stock del depósito." };
      }
    }
    const { data: p } = await sb.from("productos").select("stock_actual").eq("empresa_id", empresaId).eq("id", m.producto_id).maybeSingle();
    if (p) {
      const upd = await sb
        .from("productos")
        .update({ stock_actual: (Number((p as { stock_actual: number }).stock_actual) || 0) + cantidad })
        .eq("empresa_id", empresaId)
        .eq("id", m.producto_id);
      if (upd.error) return { ok: false, error: upd.error.message };
    }
    // Se borra el movimiento apenas se devolvió: si algo falla después, lo ya
    // devuelto no se vuelve a devolver al reintentar.
    await sb.from("movimientos_inventario").delete().eq("empresa_id", empresaId).eq("id", m.id);
  }

  if (modo === "anular") {
    const { error } = await sb.from("ventas").update({ estado: "anulada" }).eq("empresa_id", empresaId).eq("id", ventaId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  await sb.from("ventas_items").delete().eq("empresa_id", empresaId).eq("venta_id", ventaId);
  const { error } = await sb.from("ventas").delete().eq("empresa_id", empresaId).eq("id", ventaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
