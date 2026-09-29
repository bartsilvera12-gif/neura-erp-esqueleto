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
