import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { ESTADO_PROYECTO_LABEL, transicionProyectoValida } from "@/lib/produccion/estados";

type Params = { params: Promise<{ id: string }> };

/** POST { estado, motivo? } — cambia el estado del proyecto de a un paso. */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as { estado?: string; motivo?: string };
    const hacia = String(b.estado ?? "");

    const q = await ctx.supabase.from("prod_proyectos").select("estado, observaciones").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (q.error || !q.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const desde = (q.data as { estado: string }).estado;
    if (!transicionProyectoValida(desde, hacia))
      return NextResponse.json(errorResponse(`No se puede pasar de "${ESTADO_PROYECTO_LABEL[desde] ?? desde}" a "${ESTADO_PROYECTO_LABEL[hacia] ?? hacia}".`), { status: 400 });

    const patch: Record<string, unknown> = { estado: hacia, updated_at: new Date().toISOString() };
    if (hacia === "cancelado" && b.motivo) {
      const prev = (q.data as { observaciones?: string | null }).observaciones;
      patch.observaciones = `${prev ? prev + "\n" : ""}Cancelado: ${String(b.motivo).trim()}`;
    }
    const up = await ctx.supabase.from("prod_proyectos").update(patch).eq("empresa_id", emp).eq("id", id).eq("estado", desde);
    if (up.error) return NextResponse.json(errorResponse(up.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id, estado: hacia }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
