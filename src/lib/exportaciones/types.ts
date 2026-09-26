export type EstadoExportacion =
  | "preparacion"
  | "documentacion"
  | "aprobada"
  | "despachada"
  | "entregada"
  | "cerrada"
  | "anulada";

export interface Exportacion {
  id: string;
  numero: string;
  cliente_id: string | null;
  cliente_nombre: string;
  pais_destino: string;
  productor: string | null;
  factura_id: string | null;
  nota_remision_id: string | null;
  requiere_proforma: boolean;
  motivo_sin_proforma: string | null;
  estado: EstadoExportacion;
  responsable_id: string | null;
  responsable_nombre: string;
  fecha_comprometida_embarque: string | null;
  fecha_comprometida_entrega: string | null;
  fecha_embarque: string | null;
  fecha_entrega: string | null;
  aprobada_por_nombre: string | null;
  aprobada_at: string | null;
  observaciones: string | null;
  anulada_motivo: string | null;
  created_by_nombre: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExportacionItem {
  id: string;
  producto_id: string | null;
  producto_nombre: string;
  sku: string | null;
  cantidad: number;
  contenedor_id: string | null;
  observacion: string | null;
}

export interface ChecklistItem {
  item: string;
  ok: boolean;
  observacion: string | null;
  usuario_nombre: string | null;
  updated_at: string | null;
}

/** Resumen de la factura y la nota de remisión vinculadas. */
export interface VinculoFactura {
  id: string;
  numero_formateado: string | null;
  fecha: string;
  cliente_nombre: string;
  moneda: string;
  total: number;
  estado: string;
  prueba: boolean;
}
export interface VinculoRemision {
  id: string;
  numero: string | null;
  fecha: string | null;
  destino_nombre: string | null;
  estado: string;
}

export const EXPORTACION_COLS =
  "id, numero, cliente_id, cliente_nombre, pais_destino, productor, factura_id, nota_remision_id, requiere_proforma, motivo_sin_proforma, " +
  "estado, responsable_id, responsable_nombre, fecha_comprometida_embarque, fecha_comprometida_entrega, fecha_embarque, fecha_entrega, " +
  "aprobada_por_nombre, aprobada_at, observaciones, anulada_motivo, created_by_nombre, created_at, updated_at";
