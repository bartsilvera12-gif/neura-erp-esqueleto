/**
 * Control de stock del compromiso de venta: no se puede comprometer más
 * mercadería de la que hay en el almacén del que va a salir.
 *
 * Si el compromiso dice de qué almacén sale, se mira el stock de ese depósito
 * (un producto sin filas por depósito se cuenta como todo en su depósito
 * principal). Si no lo dice, se mira el stock total de la empresa, como antes.
 * Los ítems escritos a mano (sin producto del inventario) y los productos que
 * no controlan stock no se revisan.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { filasStockDeposito } from "@/lib/comex/stock-deposito";

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
export async function faltanteDeStock(
  sb: AppSupabaseClient,
  empresaId: string,
  items: ItemConStock[],
  ubicacionId?: string | null
): Promise<string | null> {
  // Un mismo producto puede estar en varios renglones: se suma todo.
  const pedido = new Map<string, number>();
  for (const it of items) {
    const id = it.producto_id ? String(it.producto_id) : "";
    if (!id) continue;
    pedido.set(id, (pedido.get(id) ?? 0) + (Number(it.cantidad) || 0));
  }
  if (!pedido.size) return null;
  const ids = [...pedido.keys()];

  const { data, error } = await sb
    .from("productos")
    .select("id, nombre, stock_actual, controla_stock, ubicacion_principal_id")
    .eq("empresa_id", empresaId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  const prods = (data ?? []) as {
    id: string;
    nombre: string;
    stock_actual: number | null;
    controla_stock: boolean | null;
    ubicacion_principal_id: string | null;
  }[];

  // Stock por depósito, solo cuando el compromiso dice de dónde sale.
  let enDeposito: Map<string, number> | null = null;
  if (ubicacionId) {
    const filas = await filasStockDeposito(sb, empresaId, ids);
    const porProducto = new Map<string, { enEste: number; enTodos: number }>();
    for (const f of filas) {
      const acc = porProducto.get(f.producto_id) ?? { enEste: 0, enTodos: 0 };
      acc.enTodos += Number(f.stock_actual) || 0;
      if (f.ubicacion_id === ubicacionId) acc.enEste += Number(f.stock_actual) || 0;
      porProducto.set(f.producto_id, acc);
    }
    enDeposito = new Map();
    for (const p of prods) {
      const acc = porProducto.get(p.id);
      const total = Number(p.stock_actual) || 0;
      // Lo que no está repartido se considera en el depósito principal.
      const suelto = Math.max(0, total - (acc?.enTodos ?? 0));
      const enPrincipal = p.ubicacion_principal_id === ubicacionId ? suelto : 0;
      enDeposito.set(p.id, (acc?.enEste ?? 0) + enPrincipal);
    }
  }

  const faltan: string[] = [];
  for (const p of prods) {
    if (p.controla_stock === false) continue;
    const hay = enDeposito ? (enDeposito.get(p.id) ?? 0) : Number(p.stock_actual) || 0;
    const quiere = pedido.get(p.id) ?? 0;
    if (quiere > hay) faltan.push(`${p.nombre}: se piden ${quiere.toLocaleString("es-PY")} y hay ${hay.toLocaleString("es-PY")}`);
  }
  if (!faltan.length) return null;
  return ubicacionId
    ? `No hay stock suficiente en el almacén elegido. ${faltan.join(". ")}. Hacé un traspaso entre depósitos o elegí otro almacén.`
    : `No hay stock suficiente. ${faltan.join(". ")}.`;
}
