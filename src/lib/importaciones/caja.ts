/**
 * Resumen de la caja de una importación: entradas, salidas y saldo en guaraníes.
 * Cada movimiento se lleva a Gs. con su propio tipo de cambio (en PYG es 1).
 * Lógica pura, sin dependencias, para poder probarla sola.
 */
export interface MovimientoCajaResumible {
  tipo: "entrada" | "salida";
  monto: number;
  tipo_cambio: number;
}

/** Un movimiento llevado a guaraníes. */
export const movimientoEnGuaranies = (m: Pick<MovimientoCajaResumible, "monto" | "tipo_cambio">): number =>
  (Number(m.monto) || 0) * (Number(m.tipo_cambio) || 1);

export interface ResumenCaja {
  entradas: number;
  salidas: number;
  saldo: number;
}

/** Suma entradas y salidas (en Gs.) y devuelve el saldo = entradas − salidas. */
export function resumenCaja(movimientos: MovimientoCajaResumible[]): ResumenCaja {
  let entradas = 0;
  let salidas = 0;
  for (const m of movimientos) {
    const gs = movimientoEnGuaranies(m);
    if (m.tipo === "entrada") entradas += gs;
    else if (m.tipo === "salida") salidas += gs;
  }
  return { entradas, salidas, saldo: entradas - salidas };
}
