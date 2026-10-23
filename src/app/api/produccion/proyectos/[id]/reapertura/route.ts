import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Params = { params: Promise<{ id: string }> };

/**
 * POST — reabre un proyecto cerrado (spec 5.10, flujo 9.3). Queda auditado:
 * quién solicita, quién autoriza, motivo y qué datos se modifican. Vuelve a
 * estado 'entregado'. Body: { motivo, solicitado_por?, autorizado_por?, datos_modificados? }
 */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const motivo = String(b.motivo ?? "").trim();
    if (!motivo) return NextResponse.json(errorResponse("Indicá el motivo de la reapertura."), { status: 400 });

    const pq = await ctx.supabase.from("prod_proyectos").select("estado").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (pq.error || !pq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    if ((pq.data as { estado: string }).estado !== "cerrado") return NextResponse.json(errorResponse("Solo se puede reabrir un proyecto cerrado."), { status: 400 });

    const ins = await ctx.supabase.from("prod_proyecto_reaperturas").insert({
      empresa_id: emp, proyecto_id: id, motivo,
      solicitado_por: String(b.solicitado_por ?? "").trim() || ctx.auth.user?.email || null,
      autorizado_por: String(b.autorizado_por ?? "").trim() || ctx.auth.user?.email || null,
      datos_modificados: String(b.datos_modificados ?? "").trim() || null,
    }).select("id").single();
    if (ins.error) return NextResponse.json(errorResponse(ins.error.message), { status: 400 });

    const upd = await ctx.supabase.from("prod_proyectos").update({ estado: "entregado", updated_at: new Date().toISOString() }).eq("empresa_id", emp).eq("id", id);
    if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id, estado: "entregado" }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
