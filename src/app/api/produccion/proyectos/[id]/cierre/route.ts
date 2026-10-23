import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { computeRentabilidad, pendientesCierre } from "@/lib/produccion/rentabilidad-helper";

type Params = { params: Promise<{ id: string }> };

/** GET — estado de cierre: pendientes bloqueantes y (si está cerrado) el snapshot guardado. */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;

    const pq = await sb.from("prod_proyectos").select("estado").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (pq.error || !pq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const estado = (pq.data as { estado: string }).estado;

    const cq = await sb.from("prod_cierres").select("*").eq("empresa_id", emp).eq("proyecto_id", id).order("cerrado_at", { ascending: false }).limit(1);
    const cierre = (cq.data?.[0] as Record<string, unknown>) ?? null;
    const pendientes = estado === "cerrado" ? [] : await pendientesCierre(sb, emp, id);
    return NextResponse.json(successResponse({ estado, pendientes, puede_cerrar: estado === "entregado", cierre }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/**
 * POST — cierra el proyecto (spec 5.10 / algoritmo 8.4).
 * Exige estado 'entregado'. Si hay pendientes bloqueantes, solo cierra con
 * excepcion_motivo. Guarda snapshot de costos/utilidad/margen y pasa a 'cerrado'.
 * Body: { inspeccion_responsable?, inspeccion_observaciones?, retrabajos?, excepcion_motivo? }
 */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const pq = await sb.from("prod_proyectos").select("estado").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (pq.error || !pq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const estado = (pq.data as { estado: string }).estado;
    if (estado === "cerrado") return NextResponse.json(errorResponse("El proyecto ya está cerrado."), { status: 400 });
    if (estado !== "entregado") return NextResponse.json(errorResponse("Solo se puede cerrar un proyecto en estado 'Entregado'."), { status: 400 });

    const excepcion = String(b.excepcion_motivo ?? "").trim() || null;
    const pendientes = await pendientesCierre(sb, emp, id);
    if (pendientes.length > 0 && !excepcion) {
      return NextResponse.json(errorResponse(`Hay pendientes que bloquean el cierre: ${pendientes.join(" ")} Para cerrar igual, indicá un motivo de excepción.`), { status: 409 });
    }

    const snapshot = await computeRentabilidad(sb, emp, id);
    const ins = await sb.from("prod_cierres").insert({
      empresa_id: emp, proyecto_id: id,
      inspeccion_responsable: String(b.inspeccion_responsable ?? "").trim() || null,
      inspeccion_observaciones: String(b.inspeccion_observaciones ?? "").trim() || null,
      retrabajos: String(b.retrabajos ?? "").trim() || null,
      excepcion_motivo: excepcion, snapshot,
      cerrado_por: ctx.auth.user?.email ?? null,
    }).select("id").single();
    if (ins.error) return NextResponse.json(errorResponse(ins.error.message), { status: 400 });

    const upd = await sb.from("prod_proyectos").update({ estado: "cerrado", updated_at: new Date().toISOString() }).eq("empresa_id", emp).eq("id", id);
    if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id, estado: "cerrado" }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
