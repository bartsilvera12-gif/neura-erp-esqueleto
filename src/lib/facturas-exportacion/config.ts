/**
 * Configuración por defecto del Autoimpresor Living Room.
 * Fuente única — coincide con el seed en la migración
 * supabase/migrations/20260922130000_facturas_exportacion.sql.
 */
export const AUTOIMPRESOR_DEFAULT = {
  timbrado: "19025402",
  establecimiento: "001",
  puntos: ["004", "005"] as string[],
  vigenciaDesde: "2026-08-03",
  vigenciaHasta: "2027-08-31",
  rangoDesde: 1,
  rangoHasta: 9999999,
};

export const MONEDAS_EXPORTACION = [
  { codigo: "USD", label: "Dólar estadounidense (USD)" },
  { codigo: "BOB", label: "Boliviano (BOB)" },
  { codigo: "PYG", label: "Guaraní (PYG)" },
  { codigo: "EUR", label: "Euro (EUR)" },
];
