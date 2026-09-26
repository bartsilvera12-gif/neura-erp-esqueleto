/** Tipos compartidos de Comercio Exterior (importaciones, exportaciones, contenedores). */

export type OrigenComex = "IMPORTACION" | "EXPORTACION" | "CONTENEDOR";

export type EstadoContenedor =
  | "en_preparacion"
  | "confirmado"
  | "en_transito"
  | "arribado"
  | "en_revision"
  | "recibido"
  | "cerrado";

export interface Contenedor {
  id: string;
  numero: string;
  tipo_operacion: "IMPORTACION" | "EXPORTACION";
  importacion_id: string | null;
  exportacion_id: string | null;
  estado: EstadoContenedor;
  naviera: string | null;
  fecha_prevista: string | null;
  fecha_real: string | null;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
}

export type EstadoIncidencia = "detectado" | "asignado" | "en_proceso" | "resuelto" | "verificado";
export type PrioridadIncidencia = "baja" | "media" | "alta";

export interface Incidencia {
  id: string;
  origen_tipo: OrigenComex;
  origen_id: string;
  tipo: string;
  descripcion: string;
  prioridad: PrioridadIncidencia;
  estado: EstadoIncidencia;
  responsable_id: string | null;
  responsable_nombre: string | null;
  accion_correctiva: string | null;
  resuelto_at: string | null;
  verificado_at: string | null;
  verificado_por_nombre: string | null;
  created_by_nombre: string | null;
  created_at: string;
  updated_at: string;
}

export interface HistorialComex {
  id: string;
  accion: string;
  detalle: Record<string, unknown> | null;
  usuario_nombre: string | null;
  created_at: string;
}

export interface AdjuntoComex {
  id: string;
  categoria: string | null;
  nombre: string;
  mime_type: string | null;
  size_bytes: number | null;
  usuario_nombre: string | null;
  created_at: string;
  url: string | null;
}
