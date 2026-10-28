import "server-only";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

/**
 * Gestión (ejercicio por año) activa. El año se guarda en la cookie `neura_gestion`
 * (la setea el selector del header). Si no hay cookie, se usa el año actual.
 * Los datos se separan por su fecha: la gestión N = fechas entre N-01-01 y N-12-31.
 */
export const GESTION_COOKIE = "neura_gestion";

export function anioActual(): number {
  return new Date().getFullYear();
}

/** Lee el año de gestión activo de la cookie del request. Default: año actual. */
export function anioGestionActiva(request?: Request | null): number {
  try {
    const cookie = request?.headers?.get("cookie") ?? "";
    const m = cookie.match(/(?:^|;\s*)neura_gestion=(\d{4})(?:;|$)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 2000 && n <= 2100) return n;
    }
  } catch {
    /* nop */
  }
  return anioActual();
}

/** Rango de fechas (inclusive) de una gestión, en formato YYYY-MM-DD. */
export function rangoGestion(anio: number): { desde: string; hasta: string } {
  return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
}

/** ¿La gestión de ese año está cerrada (solo lectura) para la empresa? */
export async function gestionCerrada(sb: AppSupabaseClient, empresaId: string, anio: number): Promise<boolean> {
  try {
    const { data } = await sb
      .from("gestiones")
      .select("estado")
      .eq("empresa_id", empresaId)
      .eq("anio", anio)
      .maybeSingle();
    return (data as { estado?: string } | null)?.estado === "cerrada";
  } catch {
    return false;
  }
}

/** Año (gestión) a partir de una fecha YYYY-MM-DD; null si no es válida. */
export function anioDeFecha(fecha: unknown): number | null {
  const s = typeof fecha === "string" ? fecha : "";
  const m = s.match(/^(\d{4})-\d{2}-\d{2}/);
  return m ? parseInt(m[1], 10) : null;
}
