import type { AppSupabaseClient } from "@/lib/supabase/schema";

/** Artículos que maneja el inventario de producción. */
export type ArticuloTipo = "tablero" | "herraje";

/** Tipos de movimiento del libro de inventario (spec 5.5). */
export const TIPOS_MOVIMIENTO = [
  "recepcion_compra",
  "entrega_contratista",
  "devolucion_aceptada",
  "devolucion_danada",
  "ajuste_conteo",
  "reverso",
] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export const TIPO_MOVIMIENTO_LABEL: Record<string, string> = {
  recepcion_compra: "Recepción de compra",
  entrega_contratista: "Entrega a contratista",
  devolucion_aceptada: "Devolución aceptada",
  devolucion_danada: "Devolución dañada",
  ajuste_conteo: "Ajuste por conteo",
  reverso: "Reverso",
};

/** Movimientos que son salidas de stock físico (restan). */
const ES_SALIDA: Record<string, boolean> = { entrega_contratista: true };
/** Movimientos que entran al físico pero NO al utilizable (spec: devolución dañada). */
const NO_UTILIZABLE: Record<string, boolean> = { devolucion_danada: true };

/**
 * Efecto neto de un movimiento sobre (stock físico, stock físico utilizable).
 * `cantidad` es siempre magnitud positiva; para ajuste_conteo, `salida=true`
 * indica que el ajuste resta.
 */
export function deltasDe(tipo: TipoMovimiento, cantidad: number, salida = false): { delta_fisico: number; delta_utilizable: number } {
  const mag = Math.abs(Number(cantidad) || 0);
  let signo = 1;
  if (ES_SALIDA[tipo]) signo = -1;
  if (tipo === "ajuste_conteo" && salida) signo = -1;
  const df = signo * mag;
  const du = NO_UTILIZABLE[tipo] ? 0 : df; // la devolución dañada entra al físico pero no al utilizable
  return { delta_fisico: df, delta_utilizable: du };
}

export type StockArticulo = { fisico: number; utilizable: number; reservado: number; disponible: number };

/** Calcula el stock de un artículo a partir de sus movimientos y reservas activas. */
export async function stockDeArticulo(sb: AppSupabaseClient, emp: string, tipo: ArticuloTipo, articuloId: string): Promise<StockArticulo> {
  const mov = await sb.from("prod_inventario_movimientos").select("delta_fisico, delta_utilizable").eq("empresa_id", emp).eq("articulo_tipo", tipo).eq("articulo_id", articuloId);
  const rows = (mov.data ?? []) as { delta_fisico: number | null; delta_utilizable: number | null }[];
  const fisico = rows.reduce((a, r) => a + (Number(r.delta_fisico) || 0), 0);
  const utilizable = rows.reduce((a, r) => a + (Number(r.delta_utilizable) || 0), 0);
  const res = await sb.from("prod_inventario_reservas").select("cantidad").eq("empresa_id", emp).eq("articulo_tipo", tipo).eq("articulo_id", articuloId).eq("estado", "activa");
  const reservado = ((res.data ?? []) as { cantidad: number | null }[]).reduce((a, r) => a + (Number(r.cantidad) || 0), 0);
  return { fisico, utilizable, reservado, disponible: utilizable - reservado };
}

/**
 * Costo promedio por artículo (método PROMEDIO, definido por el cliente).
 * promedio = Σ(costo_unitario × cantidad) / Σ(cantidad) sobre las recepciones
 * de compra que tienen costo cargado. Mapa articulo_id → costo promedio.
 */
export async function costoPromedioPorTipo(sb: AppSupabaseClient, emp: string, tipo: ArticuloTipo): Promise<Record<string, number>> {
  const { data } = await sb.from("prod_inventario_movimientos").select("articulo_id, cantidad, costo_unitario").eq("empresa_id", emp).eq("articulo_tipo", tipo).eq("tipo", "recepcion_compra");
  const acc: Record<string, { costo: number; cant: number }> = {};
  for (const r of (data ?? []) as { articulo_id: string; cantidad: number | null; costo_unitario: number | null }[]) {
    if (r.costo_unitario == null) continue;
    const a = (acc[r.articulo_id] ??= { costo: 0, cant: 0 });
    const c = Math.abs(Number(r.cantidad) || 0);
    a.costo += (Number(r.costo_unitario) || 0) * c;
    a.cant += c;
  }
  const out: Record<string, number> = {};
  for (const id of Object.keys(acc)) out[id] = acc[id].cant > 0 ? acc[id].costo / acc[id].cant : 0;
  return out;
}

/** Calcula el stock de todos los artículos de un tipo (mapa articulo_id → stock). */
export async function stockPorTipo(sb: AppSupabaseClient, emp: string, tipo: ArticuloTipo): Promise<Record<string, StockArticulo>> {
  const out: Record<string, StockArticulo> = {};
  const mov = await sb.from("prod_inventario_movimientos").select("articulo_id, delta_fisico, delta_utilizable").eq("empresa_id", emp).eq("articulo_tipo", tipo);
  for (const r of (mov.data ?? []) as { articulo_id: string; delta_fisico: number | null; delta_utilizable: number | null }[]) {
    const s = (out[r.articulo_id] ??= { fisico: 0, utilizable: 0, reservado: 0, disponible: 0 });
    s.fisico += Number(r.delta_fisico) || 0;
    s.utilizable += Number(r.delta_utilizable) || 0;
  }
  const res = await sb.from("prod_inventario_reservas").select("articulo_id, cantidad").eq("empresa_id", emp).eq("articulo_tipo", tipo).eq("estado", "activa");
  for (const r of (res.data ?? []) as { articulo_id: string; cantidad: number | null }[]) {
    const s = (out[r.articulo_id] ??= { fisico: 0, utilizable: 0, reservado: 0, disponible: 0 });
    s.reservado += Number(r.cantidad) || 0;
  }
  for (const id of Object.keys(out)) out[id].disponible = out[id].utilizable - out[id].reservado;
  return out;
}
