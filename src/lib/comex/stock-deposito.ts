/**
 * Stock de un producto en UN depósito, para el conteo físico.
 * Si el producto lleva stock por depósito (inventario_stock_ubicacion) se usa
 * esa fila; si no lleva, todo su stock está en su depósito principal.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { traerTodo } from "@/lib/comex/server";

type Fila = { producto_id: string; ubicacion_id: string; stock_actual: number };
export type ProdStock = { id: string; stock_actual: number; ubicacion_principal_id: string | null };

export async function filasStockDeposito(sb: AppSupabaseClient, emp: string, productoIds?: string[]): Promise<Fila[]> {
  if (productoIds && productoIds.length <= 200) {
    if (!productoIds.length) return [];
    const { data, error } = await sb.from("inventario_stock_ubicacion").select("producto_id, ubicacion_id, stock_actual").eq("empresa_id", emp).in("producto_id", productoIds);
    if (error) throw new Error(error.message);
    return (data ?? []) as Fila[];
  }
  return traerTodo<Fila>((a, b) =>
    sb.from("inventario_stock_ubicacion").select("producto_id, ubicacion_id, stock_actual").eq("empresa_id", emp).order("id").range(a, b)
  );
}

/** Stock en el depósito de cada producto (0 si no tiene nada ahí). */
export function stockEnDeposito(productos: ProdStock[], filas: Fila[], ubicacionId: string): Map<string, number> {
  const conFilas = new Set(filas.map((f) => f.producto_id));
  const aca = new Map(filas.filter((f) => f.ubicacion_id === ubicacionId).map((f) => [f.producto_id, Number(f.stock_actual) || 0]));
  const out = new Map<string, number>();
  for (const p of productos) {
    if (conFilas.has(p.id)) out.set(p.id, aca.get(p.id) ?? 0);
    else out.set(p.id, p.ubicacion_principal_id === ubicacionId ? Number(p.stock_actual) || 0 : 0);
  }
  return out;
}

/** Suma `delta` al stock del producto en ese depósito (si lleva stock por depósito). */
export async function moverStockDeposito(sb: AppSupabaseClient, emp: string, productoId: string, ubicacionId: string, delta: number): Promise<void> {
  const filas = await filasStockDeposito(sb, emp, [productoId]);
  if (!filas.length) return; // no lleva stock por depósito: alcanza con el total del producto
  const fila = filas.find((f) => f.ubicacion_id === ubicacionId);
  if (fila) {
    const { error } = await sb
      .from("inventario_stock_ubicacion")
      .update({ stock_actual: Number(fila.stock_actual) + delta, updated_at: new Date().toISOString() })
      .eq("empresa_id", emp)
      .eq("producto_id", productoId)
      .eq("ubicacion_id", ubicacionId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb.from("inventario_stock_ubicacion").insert({ empresa_id: emp, producto_id: productoId, ubicacion_id: ubicacionId, stock_actual: delta });
    if (error) throw new Error(error.message);
  }
}

/**
 * Antes de tocar el stock de un depósito: si el producto todavía no lleva stock
 * por depósito, se anota todo su stock actual en el depósito principal. Así lo
 * que ya tenía no "desaparece" al crear la primera fila de otro depósito.
 */
export async function asegurarStockPorDeposito(sb: AppSupabaseClient, emp: string, productoId: string): Promise<void> {
  const filas = await filasStockDeposito(sb, emp, [productoId]);
  if (filas.length) return;
  const { data } = await sb.from("productos").select("stock_actual, ubicacion_principal_id").eq("empresa_id", emp).eq("id", productoId).maybeSingle();
  const p = data as { stock_actual: number | null; ubicacion_principal_id: string | null } | null;
  if (!p?.ubicacion_principal_id || !(Number(p.stock_actual) > 0)) return;
  const { error } = await sb
    .from("inventario_stock_ubicacion")
    .insert({ empresa_id: emp, producto_id: productoId, ubicacion_id: p.ubicacion_principal_id, stock_actual: Number(p.stock_actual), es_principal: true });
  // Si otra persona la creó a la vez, ya está: no es un error.
  if (error && error.code !== "23505") throw new Error(error.message);
}

/** Suma `delta` (puede ser negativo) al stock de un producto en un depósito, creando la fila si hace falta. */
export async function sumarStockDeposito(sb: AppSupabaseClient, emp: string, productoId: string, ubicacionId: string, delta: number): Promise<void> {
  await asegurarStockPorDeposito(sb, emp, productoId);
  const fila = (await filasStockDeposito(sb, emp, [productoId])).find((f) => f.ubicacion_id === ubicacionId);
  if (fila) {
    const { error } = await sb
      .from("inventario_stock_ubicacion")
      .update({ stock_actual: Number(fila.stock_actual) + delta, updated_at: new Date().toISOString() })
      .eq("empresa_id", emp)
      .eq("producto_id", productoId)
      .eq("ubicacion_id", ubicacionId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb.from("inventario_stock_ubicacion").insert({ empresa_id: emp, producto_id: productoId, ubicacion_id: ubicacionId, stock_actual: delta });
    if (error) throw new Error(error.message);
  }
}

/**
 * Entrada de mercadería a un depósito: movimiento de inventario + stock total
 * del producto + stock del depósito. Devuelve el id del movimiento (para deshacer).
 */
export async function ingresarStock(
  sb: AppSupabaseClient,
  emp: string,
  x: { productoId: string; ubicacionId: string; cantidad: number; referencia: string; observacion: string; fecha: string; usuarioId: string | null; usuarioNombre: string | null }
): Promise<string | null> {
  const { data: prod } = await sb.from("productos").select("nombre, sku, stock_actual, costo_promedio").eq("empresa_id", emp).eq("id", x.productoId).maybeSingle();
  const p = prod as { nombre: string; sku: string | null; stock_actual: number | null; costo_promedio: number | null } | null;
  if (!p) return null;
  // Primero el depósito (con el total todavía sin tocar), después el total.
  await sumarStockDeposito(sb, emp, x.productoId, x.ubicacionId, x.cantidad);
  const upd = await sb
    .from("productos")
    .update({ stock_actual: (Number(p.stock_actual) || 0) + x.cantidad, updated_at: new Date().toISOString() })
    .eq("empresa_id", emp)
    .eq("id", x.productoId);
  if (upd.error) throw new Error(upd.error.message);
  const mov = await sb
    .from("movimientos_inventario")
    .insert({
      empresa_id: emp,
      producto_id: x.productoId,
      producto_nombre: p.nombre,
      producto_sku: p.sku ?? "",
      tipo: "ENTRADA",
      cantidad: x.cantidad,
      costo_unitario: Number(p.costo_promedio) || 0,
      origen: "compra",
      referencia: x.referencia,
      observacion: x.observacion.slice(0, 500),
      ubicacion_destino_id: x.ubicacionId,
      fecha: x.fecha,
      created_by: x.usuarioId,
      usuario_nombre: x.usuarioNombre,
    })
    .select("id")
    .single();
  if (mov.error) throw new Error(`${p.nombre}: ${mov.error.message}`);
  return (mov.data as { id: string }).id;
}

/** Deshace un `ingresarStock` (para cuando la operación que lo pidió falla a mitad). */
export async function revertirIngreso(sb: AppSupabaseClient, emp: string, x: { productoId: string; ubicacionId: string; cantidad: number; movimientoId: string | null }): Promise<void> {
  await sumarStockDeposito(sb, emp, x.productoId, x.ubicacionId, -x.cantidad);
  const { data } = await sb.from("productos").select("stock_actual").eq("empresa_id", emp).eq("id", x.productoId).maybeSingle();
  const actual = Number((data as { stock_actual: number | null } | null)?.stock_actual) || 0;
  await sb.from("productos").update({ stock_actual: actual - x.cantidad, updated_at: new Date().toISOString() }).eq("empresa_id", emp).eq("id", x.productoId);
  if (x.movimientoId) await sb.from("movimientos_inventario").delete().eq("empresa_id", emp).eq("id", x.movimientoId);
}
