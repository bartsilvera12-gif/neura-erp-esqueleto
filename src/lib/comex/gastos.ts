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
  const llevaIva = b.lleva_iva === true;
  // Si lleva IVA, el gasto va al Libro de Compras: necesita los datos de la factura.
  if (llevaIva) {
    if (!texto(b.proveedor_nombre, 200)) return { error: "El gasto lleva IVA: poné el proveedor (va al Libro de Compras)." };
    if (!texto(b.proveedor_ruc, 20)) return { error: "El gasto lleva IVA: poné el RUC del proveedor." };
    if (!texto(b.comprobante, 60)) return { error: "El gasto lleva IVA: poné el N° de comprobante de la factura." };
    if (!texto(b.timbrado, 20)) return { error: "El gasto lleva IVA: poné el timbrado de la factura." };
    if (!texto(b.cuenta_codigo, 40)) return { error: "El gasto lleva IVA: poné la cuenta contable." };
  }
  return {
    datos: {
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha ?? "")) ? String(b.fecha) : new Date().toISOString().slice(0, 10),
      tipo,
      descripcion: texto(b.descripcion, 300),
      proveedor_nombre: texto(b.proveedor_nombre, 200),
      proveedor_ruc: texto(b.proveedor_ruc, 20),
      comprobante: texto(b.comprobante, 60),
      timbrado: texto(b.timbrado, 20),
      cuenta_codigo: texto(b.cuenta_codigo, 40),
      monto,
      moneda,
      tipo_cambio: tipoCambio,
      pagado: b.pagado === true,
      lleva_iva: llevaIva,
      iva_porcentaje: llevaIva ? (Number(b.iva_porcentaje) === 5 ? 5 : 10) : null,
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
  /** Datos de la factura (solo cuando lleva IVA, para el Libro de Compras). */
  proveedor_ruc?: string | null;
  timbrado?: string | null;
  iva_porcentaje?: number | null;
  /** Factura generada en el Libro de Compras (si el gasto lleva IVA). */
  libro_compra_id?: string | null;
  /** Estado de pago de esa factura (lo arma el GET de gastos). */
  factura?: { numero_control: string; estado: string; total: number; pagado: number; saldo: number } | null;
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

export interface AsientoGastoLinea {
  cuenta: string;
  detalle: string;
  debe: number;
  haber: number;
}

/**
 * Pre-asiento de un gasto (vista previa, en guaraníes), como en los otros módulos:
 *   Debe   cuenta del gasto (Importaciones en curso)   = costo sin IVA
 *   Debe   IVA Crédito Fiscal (si lleva IVA)            = IVA (monto ÷ 11)
 *   Haber  Caja / Bancos / Cuentas por pagar           = pago (100%, con IVA)
 * Sirve igual para los gastos con IVA y para los que no (ahí no va la línea de IVA).
 * No se registra en contabilidad: eso pasa al cerrar la importación.
 */
export function preAsientoGasto(
  g: Pick<GastoComex, "monto" | "tipo_cambio" | "lleva_iva" | "cuenta_codigo" | "tipo" | "proveedor_nombre">,
  cuentas: { iva: string; porPagar: string }
): AsientoGastoLinea[] {
  const pago = gastoEnGuaranies(g);
  const costo = gastoCostoGuaranies(g);
  const iva = pago - costo;
  const detalle = [g.tipo, g.proveedor_nombre].filter(Boolean).join(" · ") || "Gasto de importación";
  const out: AsientoGastoLinea[] = [
    { cuenta: (g.cuenta_codigo ?? "").trim() || "(sin cuenta)", detalle, debe: costo, haber: 0 },
  ];
  if (iva > 0) out.push({ cuenta: cuentas.iva, detalle: "IVA Crédito Fiscal", debe: iva, haber: 0 });
  out.push({ cuenta: cuentas.porPagar || "(sin cuenta)", detalle: "Caja / Bancos / Cuentas por pagar", debe: 0, haber: pago });
  return out;
}
