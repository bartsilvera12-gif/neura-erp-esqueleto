/** Controles previos al despacho (PDF §8). Todos son obligatorios para aprobar. */
export const CHECKLIST_DESPACHO: { key: string; label: string; ayuda: string }[] = [
  { key: "productos_verificados", label: "Productos verificados", ayuda: "Los productos que salen son los de la lista." },
  { key: "cantidades_verificadas", label: "Cantidades verificadas", ayuda: "Se contaron y coinciden con la lista." },
  { key: "documentacion_completa", label: "Documentación completa", ayuda: "Factura, proforma (si corresponde) y papeles del envío." },
  { key: "contenedor_verificado", label: "Contenedor verificado", ayuda: "Número y estado del contenedor revisados." },
  { key: "productor_confirmado", label: "Proveedor / productor confirmado", ayuda: "Quién produce o provee la mercadería está confirmado." },
  { key: "destino_confirmado", label: "Datos de destino confirmados", ayuda: "Cliente, país y dirección de entrega correctos." },
  { key: "observaciones_resueltas", label: "Observaciones resueltas", ayuda: "No quedan observaciones pendientes." },
  { key: "aprobacion_responsable", label: "Aprobación del responsable", ayuda: "La marca el responsable del envío (o un administrador)." },
];
export const CHECKLIST_KEYS = new Set(CHECKLIST_DESPACHO.map((c) => c.key));
