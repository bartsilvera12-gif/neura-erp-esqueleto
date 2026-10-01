/**
 * Control de stock del compromiso de venta: no se puede comprometer más
 * mercadería de la que hay en el almacén.
 *
 * Se mira el stock total del producto (no el de un depósito), porque el
 * compromiso no dice de qué depósito sale. Los ítems escritos a mano (sin
 * producto del inventario) y los productos que no controlan stock no se revisan.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export interface ItemConStock {
  producto_id?: string | null;
  producto_nombre?: string | null;
  cantidad: number;
}

/**
 * Devuelve el mensaje de error si algún producto no alcanza, o `null` si está
 * todo bien. `excluirPresupuestoId` no se usa: el stock se compara contra lo
 * que hay hoy, sin descontar otros compromisos.
 */
export async function faltanteDeStock(sb: AppSupabaseClient, empresaId: string, items: ItemConStock[]): Promise<string | null> {
  // Un mismo producto puede estar en varios renglones: se suma todo.
  const pedido = new Map<string, number>();
  for (const it of items) {
    const id = it.producto_id ? String(it.producto_id) : "";
    if (!id) continue;
    pedido.set(id, (pedido.get(id) ?? 0) + (Number(it.cantidad) || 0));
  }
  if (!pedido.size) return null;

  const { data, error } = await sb
    .from("productos")
    .select("id, nombre, stock_actual, controla_stock")
    .eq("empresa_id", empresaId)
    .in("id", [...pedido.keys()]);
  if (error) throw new Error(error.message);

  const faltan: string[] = [];
  for (const p of (data ?? []) as { id: string; nombre: string; stock_actual: number | null; controla_stock: boolean | null }[]) {
    if (p.controla_stock === false) continue;
    const hay = Number(p.stock_actual) || 0;
    const quiere = pedido.get(p.id) ?? 0;
    if (quiere > hay) faltan.push(`${p.nombre}: se piden ${quiere.toLocaleString("es-PY")} y hay ${hay.toLocaleString("es-PY")}`);
  }
  if (!faltan.length) return null;
  return `No hay stock suficiente. ${faltan.join(". ")}.`;
}
