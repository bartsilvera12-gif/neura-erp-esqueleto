import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Params = { params: Promise<{ presId: string }> };

/**
 * POST — aprueba una versión de presupuesto.
 * Pasa el presupuesto a 'aprobada' y, si el proyecto sigue en borrador,
 * lo lleva a 'presupuestado'. Una versión aprobada ya no se edita.
 */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { presId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;

    const pq = await ctx.supabase.from("prod_presupuestos").select("id, proyecto_id, estado").eq("empresa_id", emp).eq("id", presId).maybeSingle();
    if (pq.error || !pq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const pres = pq.data as { id: string; proyecto_id: string; estado: string };
    if (pres.estado === "aprobada") return NextResponse.json(errorResponse("El presupuesto ya está aprobado."), { status: 400 });

    const nLineas = await ctx.supabase.from("prod_presupuesto_lineas").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("presupuesto_id", presId);
    if ((nLineas.count ?? 0) === 0) return NextResponse.json(errorResponse("No se puede aprobar un presupuesto sin líneas."), { status: 400 });

    const upd = await ctx.supabase.from("prod_presupuestos").update({
      estado: "aprobada",
      aprobado_por: ctx.auth.user?.email ?? null,
      aprobado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("empresa_id", emp).eq("id", presId);
    if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });

    // Si el proyecto aún está en borrador, lo marcamos como presupuestado.
    const proy = await ctx.supabase.from("prod_proyectos").select("estado").eq("empresa_id", emp).eq("id", pres.proyecto_id).maybeSingle();
    if (proy.data && (proy.data as { estado: string }).estado === "borrador") {
      await ctx.supabase.from("prod_proyectos").update({ estado: "presupuestado", updated_at: new Date().toISOString() }).eq("empresa_id", emp).eq("id", pres.proyecto_id);
    }

    return NextResponse.json(successResponse({ id: presId, estado: "aprobada" }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
