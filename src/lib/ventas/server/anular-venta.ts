/**
 * Deshace una venta: devuelve el stock (total y del depósito del que salió),
 * borra sus movimientos de inventario y la venta con sus ítems.
 *
 * Lo usa el borrado de una venta y la anulación de la factura local que la
 * originó: factura y venta son el mismo hecho, así que se deshacen juntas.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { sumarStockDeposito } from "@/lib/comex/stock-deposito";

export async function anularVentaCompleta(sb: AppSupabaseClient, empresaId: string, ventaId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: venta, error: eV } = await sb.from("ventas").select("id").eq("empresa_id", empresaId).eq("id", ventaId).maybeSingle();
  if (eV) return { ok: false, error: eV.message };
  if (!venta) return { ok: false, error: "Venta no encontrada." };

  // El depósito del que salió cada producto queda en su movimiento de inventario.
  const { data: movs } = await sb
    .from("movimientos_inventario")
    .select("producto_id, cantidad, ubicacion_origen_id")
    .eq("empresa_id", empresaId)
    .eq("venta_id", ventaId)
    .eq("tipo", "SALIDA");
  const depositoDe = new Map<string, string>();
  for (const m of (movs ?? []) as { producto_id: string | null; ubicacion_origen_id: string | null }[]) {
    if (m.producto_id && m.ubicacion_origen_id) depositoDe.set(m.producto_id, m.ubicacion_origen_id);
  }

  const { data: items } = await sb.from("ventas_items").select("producto_id, cantidad").eq("empresa_id", empresaId).eq("venta_id", ventaId);
  for (const it of (items ?? []) as { producto_id: string | null; cantidad: number }[]) {
    const cantidad = Number(it.cantidad) || 0;
    if (!it.producto_id || cantidad <= 0) continue;
    const { data: p } = await sb.from("productos").select("stock_actual").eq("empresa_id", empresaId).eq("id", it.producto_id).maybeSingle();
    if (p) {
      await sb
        .from("productos")
        .update({ stock_actual: (Number((p as { stock_actual: number }).stock_actual) || 0) + cantidad })
        .eq("empresa_id", empresaId)
        .eq("id", it.producto_id);
    }
    const dep = depositoDe.get(it.producto_id);
    if (dep) await sumarStockDeposito(sb, empresaId, it.producto_id, dep, cantidad).catch(() => undefined);
  }

  await sb.from("movimientos_inventario").delete().eq("empresa_id", empresaId).eq("venta_id", ventaId);
  await sb.from("ventas_items").delete().eq("empresa_id", empresaId).eq("venta_id", ventaId);
  const { error } = await sb.from("ventas").delete().eq("empresa_id", empresaId).eq("id", ventaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
