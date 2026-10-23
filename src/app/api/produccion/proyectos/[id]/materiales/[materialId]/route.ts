import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Params = { params: Promise<{ id: string; materialId: string }> };

/** PUT — edita la cantidad requerida / observaciones de un material. */
export async function PUT(request: NextRequest, p: Params) {
  try {
    const { id, materialId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (b.cantidad_requerida !== undefined) patch.cantidad_requerida = Math.abs(Number(b.cantidad_requerida) || 0);
    if (b.observaciones !== undefined) patch.observaciones = String(b.observaciones ?? "").trim() || null;
    const upd = await ctx.supabase.from("prod_proyecto_materiales").update(patch).eq("empresa_id", emp).eq("proyecto_id", id).eq("id", materialId);
    if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id: materialId }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** DELETE — quita un material de la lista. */
export async function DELETE(request: NextRequest, p: Params) {
  try {
    const { id, materialId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const del = await ctx.supabase.from("prod_proyecto_materiales").delete().eq("empresa_id", ctx.auth.empresa_id).eq("proyecto_id", id).eq("id", materialId);
    if (del.error) return NextResponse.json(errorResponse(del.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id: materialId }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
