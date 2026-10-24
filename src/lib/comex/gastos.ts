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

/** Valida y normaliza el cuerpo de un gasto (lo usan el alta POST y la edición PATCH). */
export function datosGasto(b: Record<string, unknown>): { datos: Record<string, unknown> } | { error: string } {
  const monto = Number(b.monto);
  if (!(monto > 0)) return { error: "El monto tiene que ser mayor a 0." };
  const moneda = String(b.moneda ?? "PYG").toUpperCase();
  if (!MONEDAS_COMEX.includes(moneda)) return { error: "Moneda no soportada." };
  const tipoCambio = moneda === "PYG" ? 1 : Number(b.tipo_cambio);
  if (!(tipoCambio > 0)) return { error: "Poné el tipo de cambio a guaraníes." };
  const tipo = String(b.tipo ?? "").trim();
  if (!TIPOS_GASTO_COMEX.includes(tipo)) return { error: "Elegí un tipo de gasto." };
  const texto = (v: unknown, max: number) => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, max) : null;
  };
  if (tipo === "OTRO" && !texto(b.descripcion, 300)) return { error: 'Cuando el concepto es "OTRO", poné el detalle del gasto.' };
  return {
    datos: {
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha ?? "")) ? String(b.fecha) : new Date().toISOString().slice(0, 10),
      tipo,
      descripcion: texto(b.descripcion, 300),
      proveedor_nombre: texto(b.proveedor_nombre, 200),
      comprobante: texto(b.comprobante, 60),
      cuenta_codigo: texto(b.cuenta_codigo, 40),
      monto,
      moneda,
      tipo_cambio: tipoCambio,
      pagado: b.pagado === true,
      lleva_iva: b.lleva_iva === true,
    },
  };
}

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
  /** Si el gasto lleva IVA (10%): el monto es el pago (100%, IVA incluido) y el
   *  costo que entra al costeo es el monto sin IVA = monto ÷ 1,1. */
  lleva_iva?: boolean;
  usuario_nombre: string | null;
  created_at: string;
}

/**
 * Factor del costo (sin IVA) cuando el gasto lleva IVA 10% incluido.
 * En Paraguay el monto gravado YA incluye el IVA, así que:
 *   - IVA (crédito fiscal) = monto ÷ 11
 *   - Costo sin IVA        = monto − IVA = monto × 10/11
 * (antes se usaba 0,9, que calculaba IVA = monto × 10%, incorrecto).
 */
export const FACTOR_COSTO_SIN_IVA = 10 / 11;

/** El gasto (pago, 100% con IVA) llevado a guaraníes (en PYG el t.c. es 1). */
export const gastoEnGuaranies = (g: Pick<GastoComex, "monto" | "tipo_cambio">) =>
  Math.round((Number(g.monto) || 0) * (Number(g.tipo_cambio) || 1));

/** El COSTO del gasto en Gs. (lo que se capitaliza): sin IVA (monto × 10/11) si lleva_iva. */
export const gastoCostoGuaranies = (g: Pick<GastoComex, "monto" | "tipo_cambio" | "lleva_iva">) => {
  const gs = (Number(g.monto) || 0) * (Number(g.tipo_cambio) || 1);
  return Math.round(g.lleva_iva ? gs * FACTOR_COSTO_SIN_IVA : gs);
};

/** Totales en Gs.: pago (100%, IVA incluido), costo (sin IVA donde aplica),
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
