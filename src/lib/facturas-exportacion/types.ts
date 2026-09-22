import type { TipoFactura } from "./config";

export type FacturaExportacionEstado = "EMITIDA" | "ANULADA";
export type IvaTipo = "EXENTA" | "5" | "10";

export interface FacturaExportacionItem {
  id?: string;
  factura_id?: string;
  producto_id?: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  iva_tipo?: IvaTipo;
  orden?: number;
}

export interface FacturaExportacion {
  id: string;
  empresa_id: string;
  tipo: TipoFactura;
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
  cliente_ciudad?: string | null;
  cliente_telefono?: string | null;
  cliente_pais: string;
  condicion_venta: "CONTADO" | "CREDITO";
  nota_remision?: string | null;
  tipo_operacion?: string | null;
  condicion_negociacion?: string | null;
  agente_transporte?: string | null;
  barcaza?: string | null;
  empresa_fletera?: string | null;
  conocimiento?: string | null;
  subtotal: number;
  total: number;
  total_exentas: number;
  total_gravado5: number;
  total_gravado10: number;
  iva5: number;
  iva10: number;
  observaciones?: string | null;
  estado: FacturaExportacionEstado;
  motivo_anulacion?: string | null;
  anulada_at?: string | null;
  anulada_por_nombre?: string | null;
  regularizacion?: boolean;
  prueba?: boolean;
  regularizacion_id?: string | null;
  created_at: string;
  created_by_nombre?: string | null;
  items?: FacturaExportacionItem[];
}

export interface FacturaConfigFiscal {
  timbrado: string;
  vigencia_desde: string;
  vigencia_hasta: string;
  ruc: string | null;
  autoimpresor_nro: string | null;
}

export type RegularizacionEstado = "PENDIENTE" | "CORRECTA" | "ANULADA" | "PENDIENTE_REEMISION" | "REEMITIDA";

export interface FacturaRegularizacion {
  id: string;
  numero_original: string;
  fecha_original: string;
  timbrado_original: string;
  punto_original: string | null;
  cliente_nombre: string;
  cliente_pais: string | null;
  moneda: string;
  total: number;
  pdf_path: string | null;
  motivo: string;
  estado: RegularizacionEstado;
  factura_vinculada_id: string | null;
  factura_vinculada_numero?: string | null;
  observaciones: string | null;
  created_by_nombre: string | null;
  created_at: string;
}
