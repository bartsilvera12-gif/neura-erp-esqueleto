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
  /** Si el gasto lleva IVA (10%): el monto es el pago (100% con IVA) y el costo
   *  que entra al costeo es el 90% sin IVA. */
  lleva_iva?: boolean;
  usuario_nombre: string | null;
  created_at: string;
}

/** Factor del costo (sin IVA) cuando el gasto lleva IVA: 90% del monto. */
export const FACTOR_COSTO_SIN_IVA = 0.9;

/** El gasto (pago, 100% con IVA) llevado a guaraníes (en PYG el t.c. es 1). */
export const gastoEnGuaranies = (g: Pick<GastoComex, "monto" | "tipo_cambio">) =>
  Math.round((Number(g.monto) || 0) * (Number(g.tipo_cambio) || 1));

/** El COSTO del gasto en Gs. (lo que se capitaliza): 90% sin IVA si lleva_iva. */
export const gastoCostoGuaranies = (g: Pick<GastoComex, "monto" | "tipo_cambio" | "lleva_iva">) => {
  const gs = (Number(g.monto) || 0) * (Number(g.tipo_cambio) || 1);
  return Math.round(g.lleva_iva ? gs * FACTOR_COSTO_SIN_IVA : gs);
};

/** Totales en Gs.: pago (100% con IVA), costo (90% sin IVA donde aplica),
 *  pendiente de pago y subtotales por tipo (sobre el pago). */
export function totalesGastos(gastos: GastoComex[]) {
  let total = 0;
  let totalCosto = 0;
  let pendiente = 0;
  const porTipo = new Map<string, number>();
  for (const g of gastos) {
    const gs = gastoEnGuaranies(g);
    total += gs;
    totalCosto += gastoCostoGuaranies(g);
    if (!g.pagado) pendiente += gs;
    porTipo.set(g.tipo, (porTipo.get(g.tipo) ?? 0) + gs);
  }
  return {
    total,
    totalCosto,
    pendiente,
    porTipo: [...porTipo.entries()].sort((a, b) => b[1] - a[1]),
  };
}
