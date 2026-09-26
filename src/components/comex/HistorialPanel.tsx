"use client";

import { useCallback, useEffect, useState } from "react";
import type { HistorialComex, OrigenComex } from "@/lib/comex/types";
import { ESTADO_CONTENEDOR_LABEL, ESTADO_EXPORTACION_LABEL, ESTADO_IMPORTACION_LABEL, ESTADO_INCIDENCIA_LABEL } from "@/lib/comex/estados";
import { Aviso, api, fechaES, fechaHora } from "./ui";

const ACCION: Record<string, string> = {
  CREAR: "Creó el registro",
  MODIFICAR: "Modificó datos",
  CAMBIAR_ESTADO: "Cambió el estado",
  ANULAR: "Anuló",
  AGREGAR_PRODUCTO: "Agregó un producto",
  MODIFICAR_PRODUCTO: "Modificó un producto",
  QUITAR_PRODUCTO: "Quitó un producto",
  AGREGAR_SERIALES: "Cargó seriales",
  QUITAR_SERIAL: "Quitó un serial",
  SERIAL_DUPLICADO_RECHAZADO: "Intentó cargar seriales duplicados (rechazado)",
  AGREGAR_CONTENEDOR: "Agregó un contenedor",
  QUITAR_CONTENEDOR: "Quitó un contenedor",
  CONTENEDOR_MODIFICAR: "Modificó un contenedor",
  CONTENEDOR_CAMBIAR_ESTADO: "Cambió el estado de un contenedor",
  RECEPCION: "Registró una recepción",
  RECEPCION_FINAL: "Registró la recepción final",
  CREAR_INCIDENCIA: "Creó una incidencia",
  MODIFICAR_INCIDENCIA: "Actualizó una incidencia",
  ADJUNTAR: "Adjuntó documentos",
  QUITAR_ADJUNTO: "Quitó un documento",
  MOVIMIENTO_CAJA: "Registró un movimiento de caja",
  APROBAR_DESPACHO: "Aprobó el despacho",
  CHECKLIST_OK: "Marcó un control como hecho",
  CHECKLIST_PENDIENTE: "Desmarcó un control",
  CHECKLIST_OBSERVACION: "Anotó una observación en un control",
  COPIAR_PRODUCTOS_FACTURA: "Copió los productos de la factura",
};

const CAMPO: Record<string, string> = {
  proveedor_nombre: "Proveedor",
  pais_origen: "País de origen",
  incoterm: "Incoterm",
  moneda: "Moneda",
  monto_estimado: "Monto estimado",
  tipo_cambio: "Tipo de cambio",
  fecha_pedido: "Fecha de pedido",
  fecha_embarque: "Fecha de embarque",
  fecha_arribo: "Fecha de arribo",
  fecha_nacionalizacion: "Fecha de nacionalización",
  responsable_nombre: "Responsable",
  observaciones: "Observaciones",
  estado: "Estado",
  numero: "Número",
  naviera: "Naviera",
  fecha_prevista: "Fecha prevista",
  fecha_real: "Fecha real",
  cantidad: "Cantidad",
  precio_unitario: "Precio",
  producto_nombre: "Producto",
  contenedor_id: "Contenedor",
  accion_correctiva: "Acción correctiva",
  prioridad: "Prioridad",
  cliente_nombre: "Cliente",
  pais_destino: "País de destino",
  productor: "Proveedor / productor",
  fecha_comprometida_embarque: "Embarque comprometido",
  fecha_comprometida_entrega: "Entrega comprometida",
  fecha_entrega: "Fecha de entrega",
  factura_id: "Factura vinculada",
  nota_remision_id: "Nota de remisión vinculada",
  requiere_proforma: "Lleva proforma",
  motivo_sin_proforma: "Motivo sin proforma",
};
const OCULTOS = new Set(["cliente_id", "proveedor_id", "responsable_id", "ubicacion_exterior_id", "ubicacion_destino_py_id", "subtotal", "producto_id", "sku", "resuelto_at", "verificado_at", "verificado_por_nombre"]);

const ESTADOS: Record<string, string> = { ...ESTADO_EXPORTACION_LABEL, ...ESTADO_IMPORTACION_LABEL, ...ESTADO_CONTENEDOR_LABEL, ...ESTADO_INCIDENCIA_LABEL };
const valor = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "—";
  const t = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return fechaES(t);
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return ESTADOS[t] ?? t;
};

/** Resume el detalle de una acción en líneas legibles. */
function lineas(h: HistorialComex): string[] {
  const d = (h.detalle ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  if (d.antes !== undefined && d.despues !== undefined) out.push(`${valor(d.antes)} → ${valor(d.despues)}`);
  if (h.accion === "CREAR") {
    const partes = [d.numero, d.proveedor ?? d.cliente, d.pais, d.responsable && `responsable ${d.responsable}`].filter(Boolean);
    if (partes.length) out.push(partes.join(" · "));
  }
  if (d.motivo) out.push(`Motivo: ${d.motivo}`);
  if (d.contenedor) out.push(`Contenedor ${d.contenedor}`);
  if (d.producto) out.push(`Producto: ${d.producto}${d.cantidad !== undefined ? ` · cantidad ${d.cantidad}` : ""}`);
  if (d.incidencia) out.push(`Incidencia: ${d.incidencia}`);
  if (d.descripcion) out.push(String(d.descripcion));
  if (Array.isArray(d.seriales)) out.push(`Seriales: ${d.seriales.join(", ")}`);
  if (d.serial) out.push(`Serial: ${d.serial}`);
  if (Array.isArray(d.detalle)) out.push(...(d.detalle as string[]));
  if (Array.isArray(d.archivos)) out.push(`${d.archivos.join(", ")}${d.categoria ? ` (${d.categoria})` : ""}`);
  if (d.archivo) out.push(String(d.archivo));
  if (d.control) out.push(`${d.control}${d.observacion ? ` · ${d.observacion}` : ""}`);
  if (Array.isArray(d.copiados)) out.push(...(d.copiados as string[]));
  if (Array.isArray(d.recibido))
    out.push(...(d.recibido as { producto?: string; cantidad?: number }[]).map((r) => `Llegó: ${r.producto} × ${r.cantidad}`));
  if (Array.isArray(d.diferencias)) out.push(...(d.diferencias as string[]).map((x) => `⚠ ${x}`));
  if (d.concepto) out.push(`${d.tipo === "entrada" ? "Entrada" : "Salida"}: ${d.concepto} · ${d.moneda} ${d.monto}`);
  if (d.cambios && typeof d.cambios === "object") {
    for (const [k, c] of Object.entries(d.cambios as Record<string, { antes: unknown; despues: unknown }>)) {
      if (OCULTOS.has(k)) continue;
      if (k === "factura_id" || k === "nota_remision_id" || k === "contenedor_id") {
        out.push(`${CAMPO[k]}: ${c.despues ? (c.antes ? "cambiada" : "asignada") : "quitada"}`);
        continue;
      }
      if (k === "requiere_proforma") {
        out.push(c.despues ? "Ahora lleva proforma" : "Ahora no lleva proforma");
        continue;
      }
      out.push(`${CAMPO[k] ?? k}: ${valor(c.antes)} → ${valor(c.despues)}`);
    }
  }
  return out;
}

export default function HistorialPanel({ origenTipo, origenId, recarga }: { origenTipo: OrigenComex; origenId: string; recarga?: number }) {
  const [lista, setLista] = useState<HistorialComex[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    try {
      const d = await api<{ historial: HistorialComex[] }>(`/api/comex/historial?origen_tipo=${origenTipo}&origen_id=${origenId}`);
      setLista(d.historial);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [origenTipo, origenId]);
  useEffect(() => {
    void cargar();
  }, [cargar, recarga]);

  return (
    <section className="space-y-2">
      {error && <Aviso>{error}</Aviso>}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {lista.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Sin movimientos.</p>}
        {lista.map((h) => (
          <div key={h.id} className="border-t border-slate-100 px-4 py-3 first:border-t-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">{ACCION[h.accion] ?? h.accion}</p>
              <p className="text-[11px] text-slate-400">
                {fechaHora(h.created_at)} · {h.usuario_nombre ?? "—"}
              </p>
            </div>
            {lineas(h).map((l, i) => (
              <p key={i} className="text-xs text-slate-600">
                {l}
              </p>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
