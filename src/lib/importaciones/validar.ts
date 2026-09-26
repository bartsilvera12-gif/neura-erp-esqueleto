/**
 * Qué le falta a una importación para pasar a un estado (PDF §3, IMP-02).
 * Devuelve la lista de faltantes en lenguaje simple; vacía = puede avanzar.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import type { EstadoImportacion } from "./types";

interface ImpRow {
  id: string;
  proveedor_nombre: string | null;
  pais_origen: string | null;
  responsable_nombre: string | null;
  fecha_embarque: string | null;
  fecha_arribo: string | null;
  fecha_nacionalizacion: string | null;
}

export async function faltantesParaEstado(
  sb: AppSupabaseClient,
  empresaId: string,
  imp: ImpRow,
  hacia: EstadoImportacion
): Promise<string[]> {
  const f: string[] = [];
  if (hacia === "anulada" || hacia === "borrador") return f;

  const [items, conts, recs, incs] = await Promise.all([
    sb.from("importacion_items").select("id, producto_id, producto_nombre, cantidad, cantidad_recibida").eq("empresa_id", empresaId).eq("importacion_id", imp.id),
    sb.from("comex_contenedores").select("id").eq("empresa_id", empresaId).eq("importacion_id", imp.id),
    sb.from("importacion_recepciones").select("id, final").eq("empresa_id", empresaId).eq("importacion_id", imp.id),
    sb.from("comex_incidencias").select("id, estado").eq("empresa_id", empresaId).eq("origen_tipo", "IMPORTACION").eq("origen_id", imp.id),
  ]);
  const errQ = items.error ?? conts.error ?? recs.error ?? incs.error;
  if (errQ) throw new Error(errQ.message);
  const its = (items.data ?? []) as { producto_id: string | null; producto_nombre: string; cantidad: number; cantidad_recibida: number }[];

  // En tránsito: la operación tiene que estar completa.
  if (!imp.proveedor_nombre) f.push("Falta el proveedor.");
  if (!imp.pais_origen) f.push("Falta el país de origen.");
  if (!imp.responsable_nombre) f.push("Falta el responsable.");
  if (!its.length) f.push("Falta cargar la mercadería.");
  const sinVincular = its.filter((i) => !i.producto_id);
  if (sinVincular.length)
    f.push(`${sinVincular.length} producto(s) sin vincular al inventario: ${sinVincular.map((i) => i.producto_nombre).join(", ")}.`);
  if (!(conts.data ?? []).length) f.push("Falta agregar al menos un contenedor.");
  if (!imp.fecha_embarque) f.push("Falta la fecha de embarque.");
  if (hacia === "en_transito") return f;

  if (!imp.fecha_arribo) f.push("Falta la fecha de arribo.");
  if (hacia === "arribado") return f;

  if (!imp.fecha_nacionalizacion) f.push("Falta la fecha de nacionalización.");
  if (hacia === "nacionalizada") return f;

  const recepciones = (recs.data ?? []) as { final: boolean }[];
  if (!recepciones.length) f.push("Falta registrar la recepción de la mercadería.");
  if (hacia === "entregada") return f;

  // Cerrada: recepción terminada y sin incidencias abiertas.
  if (recepciones.length && !recepciones.some((r) => r.final)) f.push("La recepción no está marcada como terminada.");
  const abiertas = ((incs.data ?? []) as { estado: string }[]).filter((i) => i.estado !== "resuelto" && i.estado !== "verificado");
  if (abiertas.length) f.push(`Hay ${abiertas.length} incidencia(s) sin resolver.`);
  return f;
}
