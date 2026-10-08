/**
 * Costo real de la mercadería importada: lo que facturó el proveedor más los
 * gastos de la importación repartidos entre los productos.
 *
 * El reparto puede ser **por valor** (el producto más caro absorbe más flete,
 * que es lo habitual) o **por cantidad** (todas las unidades absorben lo mismo).
 * Todo se lleva a guaraníes con el tipo de cambio de la importación.
 */

export type Prorrateo = "valor" | "cantidad";

export interface ItemCosteo {
  id: string;
  producto_id: string | null;
  producto_nombre: string;
  sku: string | null;
  cantidad: number;
  precio_unitario: number;
  moneda: string;
  subtotal: number;
  costo_final_gs?: number | null;
  /** Cuándo se pasó ese costo al inventario. */
  costo_aplicado_at?: string | null;
}

export interface FilaCosteo extends ItemCosteo {
  /** Lo que facturó el proveedor, en guaraníes. */
  subtotal_gs: number;
  /** Parte de los gastos que le toca a esta línea. */
  gastos_gs: number;
  /** Costo total de la línea (proveedor + gastos). */
  total_gs: number;
  /** Costo de una unidad puesta en el depósito. */
  costo_unitario_gs: number;
}

const round = (n: number) => Math.round(n);

/**
 * Devuelve una fila por ítem con el costo ya prorrateado, más los totales.
 * Si no hay base para repartir (todo en 0), los gastos no se asignan.
 */
export function calcularCosteo(
  items: ItemCosteo[],
  opciones: { tipoCambio: number; gastosGs: number; prorrateo: Prorrateo }
): { filas: FilaCosteo[]; totalMercaderiaGs: number; totalGastosGs: number; totalGs: number } {
  const tc = Number(opciones.tipoCambio) > 0 ? Number(opciones.tipoCambio) : 1;
  const gastos = Math.max(0, Number(opciones.gastosGs) || 0);

  const base = items.map((it) => {
    const cantidad = Number(it.cantidad) || 0;
    const subtotal = Number(it.subtotal) || (Number(it.precio_unitario) || 0) * cantidad;
    const subtotalGs = (it.moneda ?? "USD") === "PYG" ? subtotal : subtotal * tc;
    return { it, cantidad, subtotalGs };
  });

  const sumaValor = base.reduce((a, b) => a + b.subtotalGs, 0);
  const sumaCantidad = base.reduce((a, b) => a + b.cantidad, 0);
  const divisor = opciones.prorrateo === "cantidad" ? sumaCantidad : sumaValor;

  const filas: FilaCosteo[] = base.map(({ it, cantidad, subtotalGs }) => {
    const peso = opciones.prorrateo === "cantidad" ? cantidad : subtotalGs;
    const gastosGs = divisor > 0 ? (gastos * peso) / divisor : 0;
    const totalGs = subtotalGs + gastosGs;
    return {
      ...it,
      cantidad,
      subtotal_gs: round(subtotalGs),
      gastos_gs: round(gastosGs),
      total_gs: round(totalGs),
      costo_unitario_gs: cantidad > 0 ? round(totalGs / cantidad) : 0,
    };
  });

  return {
    filas,
    totalMercaderiaGs: round(sumaValor),
    totalGastosGs: round(gastos),
    totalGs: round(sumaValor + gastos),
  };
}
