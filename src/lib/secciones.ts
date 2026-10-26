/**
 * Secciones de la empresa (Living Room): separan gastos y libro de compras entre
 * Showroom, Producción y Comercio Exterior. El "Libro de compras general"
 * (Contabilidad) consolida las tres. Lo existente queda como SHOWROOM.
 */
export const SECCIONES = ["SHOWROOM", "PRODUCCION", "COMERCIO_EXTERIOR"] as const;
export type Seccion = (typeof SECCIONES)[number];

export const SECCION_DEFECTO: Seccion = "SHOWROOM";

/** Nombre lindo para mostrar en pantalla. */
export const SECCION_LABEL: Record<Seccion, string> = {
  SHOWROOM: "Showroom",
  PRODUCCION: "Producción",
  COMERCIO_EXTERIOR: "Comercio Exterior",
};

/** Prefijo del número de recibo de gasto sin factura por sección. */
export const RECIBO_PREFIJO: Record<Seccion, string> = {
  SHOWROOM: "SHLR",
  PRODUCCION: "PRLR",
  COMERCIO_EXTERIOR: "CELR",
};

/** Ruta del listado de gastos de cada sección. */
export const GASTOS_RUTA: Record<Seccion, string> = {
  SHOWROOM: "/gastos",
  PRODUCCION: "/produccion/gastos",
  COMERCIO_EXTERIOR: "/comex/gastos",
};

/** Ruta del libro de compras de cada sección. */
export const LIBRO_COMPRAS_RUTA: Record<Seccion, string> = {
  SHOWROOM: "/libro-compras",
  PRODUCCION: "/produccion/libro-compras",
  COMERCIO_EXTERIOR: "/comex/libro-compras",
};

export function esSeccion(v: unknown): v is Seccion {
  return typeof v === "string" && (SECCIONES as readonly string[]).includes(v);
}

/** Normaliza un valor a una sección válida (default Showroom). */
export function aSeccion(v: unknown): Seccion {
  return esSeccion(v) ? v : SECCION_DEFECTO;
}
