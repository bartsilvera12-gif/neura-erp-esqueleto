import type { AppSupabaseClient } from "@/lib/supabase/schema";

/** Recalcula y guarda el total del presupuesto (Σ subtotales de las líneas). */
export async function recomputarTotalPresupuesto(sb: AppSupabaseClient, emp: string, presId: string): Promise<number> {
  const { data } = await sb.from("prod_presupuesto_lineas").select("subtotal").eq("empresa_id", emp).eq("presupuesto_id", presId);
  const total = ((data ?? []) as { subtotal: number | null }[]).reduce((a, r) => a + (Number(r.subtotal) || 0), 0);
  await sb.from("prod_presupuestos").update({ total, updated_at: new Date().toISOString() }).eq("empresa_id", emp).eq("id", presId);
  return total;
}

/** Devuelve el presupuesto si está editable (borrador); si no, un error. */
export async function presupuestoEditable(sb: AppSupabaseClient, emp: string, presId: string): Promise<{ estado: string } | { error: string }> {
  const { data, error } = await sb.from("prod_presupuestos").select("estado").eq("empresa_id", emp).eq("id", presId).maybeSingle();
  if (error || !data) return { error: "Presupuesto no encontrado." };
  const estado = (data as { estado: string }).estado;
  if (estado !== "borrador") return { error: "Un presupuesto aprobado no se edita: creá una nueva versión." };
  return { estado };
}
