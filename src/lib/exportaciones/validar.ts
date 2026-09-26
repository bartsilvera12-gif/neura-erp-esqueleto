/**
 * Qué le falta a una exportación para pasar a un estado (PDF §5 y §8).
 * Vacío = puede avanzar. Aprobar exige el checklist completo (QA-01) y la
 * proforma salvo en operaciones sin proforma (Sarasota, EXP-02/EXP-03).
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { CHECKLIST_DESPACHO } from "./checklist";
import type { EstadoExportacion } from "./types";

interface ExpRow {
  id: string;
  cliente_nombre: string | null;
  pais_destino: string | null;
  responsable_nombre: string | null;
  fecha_comprometida_embarque: string | null;
  factura_id: string | null;
  nota_remision_id: string | null;
  requiere_proforma: boolean;
  fecha_embarque: string | null;
  fecha_entrega: string | null;
}

export async function faltantesExportacion(
  sb: AppSupabaseClient,
  empresaId: string,
  exp: ExpRow,
  hacia: EstadoExportacion
): Promise<string[]> {
  const f: string[] = [];
  if (hacia === "anulada" || hacia === "preparacion") return f;

  const [items, conts, check, proformas, incs, factura] = await Promise.all([
    sb.from("exportacion_items").select("producto_id, producto_nombre").eq("empresa_id", empresaId).eq("exportacion_id", exp.id),
    sb.from("comex_contenedores").select("id").eq("empresa_id", empresaId).eq("exportacion_id", exp.id),
    sb.from("exportacion_checklist").select("item, ok").eq("empresa_id", empresaId).eq("exportacion_id", exp.id),
    sb.from("comex_adjuntos").select("id").eq("empresa_id", empresaId).eq("origen_tipo", "EXPORTACION").eq("origen_id", exp.id).eq("categoria", "Proforma"),
    sb.from("comex_incidencias").select("estado").eq("empresa_id", empresaId).eq("origen_tipo", "EXPORTACION").eq("origen_id", exp.id),
    exp.factura_id
      ? sb.from("facturas_exportacion").select("estado").eq("empresa_id", empresaId).eq("id", exp.factura_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const its = (items.data ?? []) as { producto_id: string | null; producto_nombre: string }[];

  // Documentación: el envío tiene que estar armado.
  if (!exp.cliente_nombre) f.push("Falta el cliente.");
  if (!exp.pais_destino) f.push("Falta el país de destino.");
  if (!exp.responsable_nombre) f.push("Falta el responsable.");
  if (!its.length) f.push("Falta cargar los productos.");
  const sinVincular = its.filter((i) => !i.producto_id);
  if (sinVincular.length) f.push(`${sinVincular.length} producto(s) sin vincular al inventario.`);
  if (!(conts.data ?? []).length) f.push("Falta agregar el contenedor.");
  if (!exp.fecha_comprometida_embarque) f.push("Falta la fecha comprometida de embarque.");
  if (hacia === "documentacion") return f;

  // Aprobar despacho: papeles y checklist.
  if (exp.requiere_proforma && !(proformas.data ?? []).length) f.push("Falta adjuntar la proforma (en Documentos, tipo “Proforma”).");
  const estadoFactura = (factura.data as { estado?: string } | null)?.estado;
  if (!exp.factura_id) f.push("Falta vincular la factura de exportación.");
  else if (estadoFactura !== "EMITIDA") f.push("La factura vinculada no está emitida (está anulada o es un borrador).");
  const ok = new Set(((check.data ?? []) as { item: string; ok: boolean }[]).filter((c) => c.ok).map((c) => c.item));
  const pendientes = CHECKLIST_DESPACHO.filter((c) => !ok.has(c.key));
  if (pendientes.length) f.push(`Checklist incompleto: ${pendientes.map((c) => c.label.toLowerCase()).join(", ")}.`);
  const abiertas = ((incs.data ?? []) as { estado: string }[]).filter((i) => i.estado !== "resuelto" && i.estado !== "verificado");
  if (abiertas.length) f.push(`Hay ${abiertas.length} incidencia(s) sin resolver.`);
  if (hacia === "aprobada") return f;

  if (!exp.nota_remision_id) f.push("Falta vincular la nota de remisión.");
  if (!exp.fecha_embarque) f.push("Falta la fecha real de embarque.");
  if (hacia === "despachada") return f;

  if (!exp.fecha_entrega) f.push("Falta la fecha de entrega.");
  return f;
}
