export type FacturaExportacionEstado = "EMITIDA" | "ANULADA";

export interface FacturaExportacionItem {
  id?: string;
  factura_id?: string;
  producto_id?: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  orden?: number;
}

export interface FacturaExportacion {
  id: string;
  empresa_id: string;
  establecimiento: string;
  punto_expedicion: string;
  timbrado: string;
  numero: number;
  numero_formateado: string;
  fecha: string;
  moneda: string;
  tipo_cambio: number;
  cliente_nombre: string;
  cliente_documento?: string | null;
  cliente_direccion?: string | null;
  cliente_pais: string;
  subtotal: number;
  total: number;
  observaciones?: string | null;
  estado: FacturaExportacionEstado;
  motivo_anulacion?: string | null;
  anulada_at?: string | null;
  anulada_por_nombre?: string | null;
  regularizacion: boolean;
  created_at: string;
  created_by_nombre?: string | null;
  items?: FacturaExportacionItem[];
}

export interface FacturaExportacionConfig {
  id: string;
  empresa_id: string;
  establecimiento: string;
  punto_expedicion: string;
  timbrado: string;
  vigencia_desde: string;
  vigencia_hasta: string;
  rango_desde: number;
  rango_hasta: number;
  proximo_numero: number;
  activo: boolean;
}

export interface EmitirFacturaExportacionInput {
  establecimiento: string;
  punto_expedicion: string;
  fecha?: string;
  moneda: string;
  tipo_cambio: number;
  cliente_nombre: string;
  cliente_documento?: string | null;
  cliente_direccion?: string | null;
  cliente_pais: string;
  observaciones?: string | null;
  items: Array<{
    producto_id?: string | null;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
  }>;
}

export interface RegularizarFacturaExportacionInput extends EmitirFacturaExportacionInput {
  numero: number;
}
