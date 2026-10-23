import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const MODALIDADES = ["global", "por_unidad", "mixta"] as const;
export type Modalidad = (typeof MODALIDADES)[number];
export const MODALIDAD_LABEL: Record<string, string> = { global: "Precio global", por_unidad: "Por mueble/unidad", mixta: "Mixta" };

export const TIPOS_PARTIDA = ["unidad", "adicional", "descuento"] as const;
export const TIPO_PARTIDA_LABEL: Record<string, string> = { unidad: "Mueble/unidad", adicional: "Adicional", descuento: "Descuento" };

export const CAUSAS_ADICIONAL = ["ampliacion", "cambio_diseno", "error_diseno", "error_contratista", "otra"] as const;
export const CAUSA_ADICIONAL_LABEL: Record<string, string> = {
  ampliacion: "Ampliación de mobiliario", cambio_diseno: "Cambio de diseño", error_diseno: "Error de diseño",
  error_contratista: "Error del contratista", otra: "Otra",
};

/**
 * Recalcula y guarda el importe solicitado de una orden según su modalidad:
 *  - global:     importe_base (+ adicionales − descuentos)
 *  - por_unidad: Σ partidas de unidad (+ adicionales − descuentos)
 *  - mixta:      importe_base + Σ partidas (unidad/adicional/descuento)
 * Los descuentos se guardan con subtotal negativo, así que se suman directo.
 */
export async function recomputarImporteOrden(sb: AppSupabaseClient, emp: string, ordenId: string): Promise<number> {
  const oq = await sb.from("prod_contratista_ordenes").select("modalidad, importe_base").eq("empresa_id", emp).eq("id", ordenId).maybeSingle();
  const o = (oq.data ?? { modalidad: "global", importe_base: 0 }) as { modalidad: string; importe_base: number | null };
  const lq = await sb.from("prod_contratista_orden_lineas").select("tipo_partida, subtotal").eq("empresa_id", emp).eq("orden_id", ordenId);
  const lineas = (lq.data ?? []) as { tipo_partida: string; subtotal: number | null }[];

  const base = o.modalidad === "por_unidad" ? 0 : Number(o.importe_base) || 0;
  const sumaLineas = lineas.reduce((a, l) => {
    // En modalidad global, solo cuentan adicionales y descuentos (las unidades no aplican).
    if (o.modalidad === "global" && l.tipo_partida === "unidad") return a;
    return a + (Number(l.subtotal) || 0);
  }, 0);
  const total = Math.round((base + sumaLineas) * 100) / 100;
  await sb.from("prod_contratista_ordenes").update({ importe_solicitado: total, updated_at: new Date().toISOString() }).eq("empresa_id", emp).eq("id", ordenId);
  return total;
}

/** Devuelve la orden si está editable (borrador); si no, un error. */
export async function ordenEditable(sb: AppSupabaseClient, emp: string, ordenId: string): Promise<{ estado: string; modalidad: string } | { error: string }> {
  const { data, error } = await sb.from("prod_contratista_ordenes").select("estado, modalidad").eq("empresa_id", emp).eq("id", ordenId).maybeSingle();
  if (error || !data) return { error: "Orden no encontrada." };
  const d = data as { estado: string; modalidad: string };
  if (d.estado !== "borrador") return { error: "Una cotización aprobada no se edita: creá una nueva versión." };
  return d;
}
