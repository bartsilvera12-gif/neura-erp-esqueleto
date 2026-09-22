export type TipoFactura = "EXPORTACION" | "LOCAL";

export const EMPRESA_FACTURA = {
  razonSocial: "LIVING ROOM MUEBLES E.A.S.",
  ruc: "80150840-1",
  actividad: [
    "Comercio al por mayor de muebles y artículos de iluminación",
    "Venta de muebles importados · Diseño especializado · Decoración de interiores",
  ],
  direccion: "Avda. Santa Teresa No. 2709 c/ Denis Roa · Asunción, Paraguay · Cel. (0971) 880-905",
  autoimpresorNro: "350010028049",
  /** PNG opcional en /public. Si no existe, el PDF dibuja el logo en texto. */
  logoPath: "brand/livingroom-logo.png",
};

export const BANCO_EXPORTACION = {
  banco: "BANCO CONTINENTAL S.A.",
  cuenta: "14270083490501",
  swift: "BNITPYPAXXX",
  beneficiario: "LIVING ROOM MUEBLES EAS",
  bancoCorresponsal: "CITIBANK NA (NEW YORK USA)",
  swiftCorresponsal: "CITIUS33XXX",
  aba: "021000089",
};

export const TIPOS_FACTURA: Record<TipoFactura, { label: string; titulo: string; monedaDefault: string; puntos: string[] }> = {
  EXPORTACION: { label: "Factura de exportación", titulo: "FACTURA DE EXPORTACIÓN", monedaDefault: "USD", puntos: ["004", "005"] },
  LOCAL: { label: "Factura local", titulo: "FACTURA", monedaDefault: "PYG", puntos: ["001"] },
};

export const AUTOIMPRESOR_DEFAULT = {
  timbrado: "19025402",
  establecimiento: "001",
  puntos: ["004", "005"] as string[],
  vigenciaDesde: "2026-08-03",
  vigenciaHasta: "2027-08-31",
};

export const MONEDAS_EXPORTACION = [
  { codigo: "USD", label: "Dólares americanos (USD)" },
  { codigo: "PYG", label: "Guaraníes (PYG)" },
  { codigo: "BOB", label: "Bolivianos (BOB)" },
  { codigo: "EUR", label: "Euros (EUR)" },
];

export const NOMBRE_MONEDA: Record<string, string> = {
  USD: "DÓLARES AMERICANOS",
  PYG: "GUARANÍES",
  BOB: "BOLIVIANOS",
  EUR: "EUROS",
};
