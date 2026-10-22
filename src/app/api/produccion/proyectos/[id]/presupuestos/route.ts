import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Params = { params: Promise<{ id: string }> };

/** GET — versiones de presupuesto del proyecto (la más nueva primero). */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("prod_presupuestos")
      .select("id, version, estado, fecha, total, aprobado_por, aprobado_at, created_at")
      .eq("empresa_id", ctx.auth.empresa_id).eq("proyecto_id", id)
      .order("version", { ascending: false });
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ presupuestos: data ?? [] }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** POST — crea una nueva versión de presupuesto (en borrador). */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;

    const pq = await ctx.supabase.from("prod_proyectos").select("id").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (pq.error || !pq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const last = await ctx.supabase.from("prod_presupuestos").select("version").eq("empresa_id", emp).eq("proyecto_id", id).order("version", { ascending: false }).limit(1);
    const version = ((last.data?.[0] as { version?: number } | undefined)?.version ?? 0) + 1;

    const ins = await ctx.supabase.from("prod_presupuestos").insert({
      empresa_id: emp, proyecto_id: id, version, estado: "borrador", total: 0,
      created_by: ctx.auth.usuarioCatalogId ?? null, created_by_nombre: ctx.auth.user?.email ?? null,
    }).select("id, version").single();
    if (ins.error) return NextResponse.json(errorResponse(ins.error.message), { status: 400 });
    return NextResponse.json(successResponse({ presupuesto: ins.data }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
