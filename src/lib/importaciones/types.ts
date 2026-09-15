export type EstadoImportacion =
  | "borrador"
  | "en_transito"
  | "arribado"
  | "nacionalizada"
  | "entregada"
  | "cerrada"
  | "anulada";

export interface Importacion {
  id: string;
  numero: string;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  pais_origen: string;
  incoterm: string | null;
  moneda: "PYG" | "USD" | "BOB";
  monto_estimado: number;
  tipo_cambio: number;
  fecha_pedido: string | null;
  fecha_embarque: string | null;
  fecha_arribo: string | null;
  fecha_nacionalizacion: string | null;
  ubicacion_exterior_id: string | null;
  ubicacion_destino_py_id: string | null;
  estado: EstadoImportacion;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportacionItem {
  id: string;
  importacion_id: string;
  producto_id: string | null;
  producto_nombre: string;
  sku: string | null;
  cantidad: number;
  precio_unitario: number;
  moneda: "PYG" | "USD" | "BOB";
  subtotal: number;
  cantidad_recibida: number;
  observacion: string | null;
}

export interface ImportacionCajaMov {
  id: string;
  importacion_id: string;
  tipo: "entrada" | "salida";
  concepto: string;
  monto: number;
  moneda: "PYG" | "USD" | "BOB";
  tipo_cambio: number;
  fecha: string;
  referencia: string | null;
  observacion: string | null;
  banco_movimiento_id: string | null;
  usuario_nombre: string | null;
  created_at: string;
}
