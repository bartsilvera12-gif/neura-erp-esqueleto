/** Gastos incurridos de una operación de comercio exterior: tipos y totales. */

/** Los conceptos que arman el costo real de traer o enviar la mercadería. */
export const TIPOS_GASTO_COMEX = [
  "FLETE INTERNACIONAL",
  "FLETE INTERNO",
  "SEGURO",
  "DESPACHANTE",
  "TRIBUTOS ADUANEROS",
  "ALMACENAJE / DEPÓSITO",
  "CERTIFICACIONES",
  "GASTOS BANCARIOS",
  "OTRO",
];

export const MONEDAS_COMEX = ["PYG", "USD", "BOB"];

export interface GastoComex {
  id: string;
  origen_tipo: "IMPORTACION" | "EXPORTACION";
  origen_id: string;
  fecha: string;
  tipo: string;
  descripcion: string | null;
  proveedor_nombre: string | null;
  comprobante: string | null;
  monto: number;
  moneda: string;
  tipo_cambio: number;
  pagado: boolean;
  /** Cuenta del plan de cuentas, para que el gasto llegue a contabilidad. */
  cuenta_codigo: string | null;
  usuario_nombre: string | null;
  created_at: string;
}

/** El gasto llevado a guaraníes (en PYG el tipo de cambio es 1). */
export const gastoEnGuaranies = (g: Pick<GastoComex, "monto" | "tipo_cambio">) =>
  Math.round((Number(g.monto) || 0) * (Number(g.tipo_cambio) || 1));

/** Total en Gs., total pendiente de pago y subtotales por tipo. */
export function totalesGastos(gastos: GastoComex[]) {
  let total = 0;
  let pendiente = 0;
  const porTipo = new Map<string, number>();
  for (const g of gastos) {
    const gs = gastoEnGuaranies(g);
    total += gs;
    if (!g.pagado) pendiente += gs;
    porTipo.set(g.tipo, (porTipo.get(g.tipo) ?? 0) + gs);
  }
  return {
    total,
    pendiente,
    porTipo: [...porTipo.entries()].sort((a, b) => b[1] - a[1]),
  };
}
