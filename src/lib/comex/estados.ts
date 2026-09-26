/**
 * Estados de Comercio Exterior y sus pasos válidos. Lo usan la API (valida)
 * y la pantalla (muestra el siguiente paso), así nunca se contradicen.
 */
import type { EstadoImportacion } from "@/lib/importaciones/types";
import type { EstadoExportacion } from "@/lib/exportaciones/types";
import type { EstadoContenedor, EstadoIncidencia } from "./types";

// ── Importación ──────────────────────────────────────────────────────────────
export const FLUJO_IMPORTACION: EstadoImportacion[] = [
  "borrador",
  "en_transito",
  "arribado",
  "nacionalizada",
  "entregada",
  "cerrada",
];

export const ESTADO_IMPORTACION_LABEL: Record<EstadoImportacion, string> = {
  borrador: "Borrador",
  en_transito: "En tránsito",
  arribado: "Arribado",
  nacionalizada: "Nacionalizada",
  entregada: "Entregada",
  cerrada: "Cerrada",
  anulada: "Anulada",
};

/** Se avanza o retrocede de a un paso; se anula desde cualquier estado menos cerrada. */
export function transicionImportacionValida(desde: EstadoImportacion, hacia: EstadoImportacion): boolean {
  if (desde === "anulada" || desde === "cerrada") return false;
  if (hacia === "anulada") return true;
  const a = FLUJO_IMPORTACION.indexOf(desde);
  const b = FLUJO_IMPORTACION.indexOf(hacia);
  return a >= 0 && b >= 0 && Math.abs(a - b) === 1;
}

export function siguienteImportacion(e: EstadoImportacion): EstadoImportacion | null {
  const i = FLUJO_IMPORTACION.indexOf(e);
  return i >= 0 && i < FLUJO_IMPORTACION.length - 1 ? FLUJO_IMPORTACION[i + 1] : null;
}

export function anteriorImportacion(e: EstadoImportacion): EstadoImportacion | null {
  const i = FLUJO_IMPORTACION.indexOf(e);
  return i > 0 && e !== "cerrada" ? FLUJO_IMPORTACION[i - 1] : null;
}

// ── Exportación ──────────────────────────────────────────────────────────────
export const FLUJO_EXPORTACION: EstadoExportacion[] = ["preparacion", "documentacion", "aprobada", "despachada", "entregada", "cerrada"];

export const ESTADO_EXPORTACION_LABEL: Record<EstadoExportacion, string> = {
  preparacion: "En preparación",
  documentacion: "Documentación",
  aprobada: "Despacho aprobado",
  despachada: "Despachada",
  entregada: "Entregada",
  cerrada: "Cerrada",
  anulada: "Anulada",
};

export function transicionExportacionValida(desde: EstadoExportacion, hacia: EstadoExportacion): boolean {
  if (desde === "anulada" || desde === "cerrada") return false;
  if (hacia === "anulada") return true;
  const a = FLUJO_EXPORTACION.indexOf(desde);
  const b = FLUJO_EXPORTACION.indexOf(hacia);
  return a >= 0 && b >= 0 && Math.abs(a - b) === 1;
}

export function siguienteExportacion(e: EstadoExportacion): EstadoExportacion | null {
  const i = FLUJO_EXPORTACION.indexOf(e);
  return i >= 0 && i < FLUJO_EXPORTACION.length - 1 ? FLUJO_EXPORTACION[i + 1] : null;
}

export function anteriorExportacion(e: EstadoExportacion): EstadoExportacion | null {
  const i = FLUJO_EXPORTACION.indexOf(e);
  return i > 0 && e !== "cerrada" ? FLUJO_EXPORTACION[i - 1] : null;
}

// ── Contenedor ───────────────────────────────────────────────────────────────
export const FLUJO_CONTENEDOR: EstadoContenedor[] = [
  "en_preparacion",
  "confirmado",
  "en_transito",
  "arribado",
  "en_revision",
  "recibido",
  "cerrado",
];

export const ESTADO_CONTENEDOR_LABEL: Record<EstadoContenedor, string> = {
  en_preparacion: "En preparación",
  confirmado: "Confirmado",
  en_transito: "En tránsito",
  arribado: "Arribado",
  en_revision: "En revisión",
  recibido: "Recibido",
  cerrado: "Cerrado",
};

export function transicionContenedorValida(desde: EstadoContenedor, hacia: EstadoContenedor): boolean {
  if (desde === "cerrado") return false;
  const a = FLUJO_CONTENEDOR.indexOf(desde);
  const b = FLUJO_CONTENEDOR.indexOf(hacia);
  return a >= 0 && b >= 0 && Math.abs(a - b) === 1;
}

// ── Incidencia ───────────────────────────────────────────────────────────────
export const FLUJO_INCIDENCIA: EstadoIncidencia[] = ["detectado", "asignado", "en_proceso", "resuelto", "verificado"];

export const ESTADO_INCIDENCIA_LABEL: Record<EstadoIncidencia, string> = {
  detectado: "Detectada",
  asignado: "Asignada",
  en_proceso: "En proceso",
  resuelto: "Resuelta",
  verificado: "Verificada",
};

export const TIPO_INCIDENCIA_LABEL: Record<string, string> = {
  DIFERENCIA_RECEPCION: "Diferencia en la recepción",
  PRODUCTO_NO_VINCULADO: "Producto no vinculado al inventario",
  SERIAL_DUPLICADO: "Serial duplicado",
  DOCUMENTACION: "Documentación",
  OTRO: "Otro",
};

export const incidenciaAbierta = (e: EstadoIncidencia) => e !== "resuelto" && e !== "verificado";
