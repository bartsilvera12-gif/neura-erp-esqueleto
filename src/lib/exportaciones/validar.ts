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

  const q = <T,>(r: { data: T | null; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  const [items, conts, check, proformas, incs, factura, remision, config] = await Promise.all([
    sb.from("exportacion_items").select("producto_id, producto_nombre").eq("empresa_id", empresaId).eq("exportacion_id", exp.id),
    sb.from("comex_contenedores").select("id").eq("empresa_id", empresaId).eq("exportacion_id", exp.id),
    sb.from("exportacion_checklist").select("item, ok").eq("empresa_id", empresaId).eq("exportacion_id", exp.id),
    sb.from("comex_adjuntos").select("id").eq("empresa_id", empresaId).eq("origen_tipo", "EXPORTACION").eq("origen_id", exp.id).eq("categoria", "Proforma"),
    sb.from("comex_incidencias").select("estado").eq("empresa_id", empresaId).eq("origen_tipo", "EXPORTACION").eq("origen_id", exp.id),
    exp.factura_id
      ? sb.from("facturas_exportacion").select("estado, prueba").eq("empresa_id", empresaId).eq("id", exp.factura_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    exp.nota_remision_id
      ? sb.from("notas_remision").select("estado").eq("empresa_id", empresaId).eq("id", exp.nota_remision_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb.from("facturas_exportacion_config").select("modo_prueba").eq("empresa_id", empresaId).eq("activo", true),
  ]);
  const its = (q(items) ?? []) as { producto_id: string | null; producto_nombre: string }[];
  const fac = q(factura) as { estado?: string; prueba?: boolean } | null;
  const nr = q(remision) as { estado?: string } | null;
  const enModoPrueba = ((q(config) ?? []) as { modo_prueba: boolean }[]).some((c) => c.modo_prueba);
  const abiertas = ((q(incs) ?? []) as { estado: string }[]).filter((i) => i.estado !== "resuelto" && i.estado !== "verificado");
  const facturaOk = () => {
    if (!exp.factura_id) f.push("Falta vincular la factura de exportación.");
    else if (fac?.estado !== "EMITIDA") f.push("La factura vinculada no está emitida (está anulada o es un borrador).");
    else if (fac?.prueba && !enModoPrueba) f.push("La factura vinculada es de prueba: vinculá la factura real.");
  };

  // Documentación: el envío tiene que estar armado.
  if (hacia === "documentacion") {
    if (!exp.cliente_nombre) f.push("Falta el cliente.");
    if (!exp.pais_destino) f.push("Falta el país de destino.");
    if (!exp.responsable_nombre) f.push("Falta el responsable.");
    if (!its.length) f.push("Falta cargar los productos.");
    const sinVincular = its.filter((i) => !i.producto_id);
    if (sinVincular.length) f.push(`${sinVincular.length} producto(s) sin vincular al inventario.`);
    if (!(q(conts) ?? []).length) f.push("Falta agregar el contenedor.");
    if (!exp.fecha_comprometida_embarque) f.push("Falta la fecha comprometida de embarque.");
    return f;
  }

  // Aprobar despacho: papeles, checklist y nada pendiente.
  if (hacia === "aprobada") {
    if (!its.length) f.push("Falta cargar los productos.");
    if (!(q(conts) ?? []).length) f.push("Falta agregar el contenedor.");
    if (exp.requiere_proforma && !(q(proformas) ?? []).length) f.push("Falta adjuntar la proforma (en Documentos, tipo “Proforma”).");
    facturaOk();
    const ok = new Set(((q(check) ?? []) as { item: string; ok: boolean }[]).filter((c) => c.ok).map((c) => c.item));
    const pendientes = CHECKLIST_DESPACHO.filter((c) => !ok.has(c.key));
    if (pendientes.length) f.push(`Control de despacho incompleto: ${pendientes.map((c) => c.label.toLowerCase()).join(", ")}.`);
    if (abiertas.length) f.push(`Hay ${abiertas.length} incidencia(s) sin resolver.`);
    return f;
  }

  // Despachada: sale con su nota de remisión aprobada y la factura sigue válida.
  if (hacia === "despachada") {
    facturaOk();
    if (!exp.nota_remision_id) f.push("Falta vincular la nota de remisión.");
    else if (nr?.estado !== "aprobada") f.push("La nota de remisión todavía no está aprobada.");
    if (!exp.fecha_embarque) f.push("Falta la fecha real de embarque (en Datos).");
    return f;
  }

  if (hacia === "entregada") {
    if (!exp.fecha_entrega) f.push("Falta la fecha real de entrega (en Datos).");
    return f;
  }

  // Cerrada: sin incidencias abiertas.
  if (abiertas.length) f.push(`Hay ${abiertas.length} incidencia(s) sin resolver.`);
  return f;
}
