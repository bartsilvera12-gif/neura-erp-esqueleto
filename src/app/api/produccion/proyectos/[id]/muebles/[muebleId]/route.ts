import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Params = { params: Promise<{ id: string; muebleId: string }> };
const CAMPOS = ["codigo","descripcion","cantidad","estado","observaciones"] as const;

export async function PUT(request: NextRequest, p: Params) {
  try {
    const { id, muebleId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const k of CAMPOS) {
      if (!(k in b)) continue;
      const v = b[k];
      if (k === "descripcion") { const s = String(v ?? "").trim(); if (!s) return NextResponse.json(errorResponse("La descripción no puede quedar vacía."), { status: 400 }); patch[k] = s; }
      else if (k === "cantidad") { const n = Number(v); if (!(n > 0)) return NextResponse.json(errorResponse("Cantidad inválida."), { status: 400 }); patch[k] = n; }
      else patch[k] = v ? String(v).trim() : null;
    }
    const up = await ctx.supabase.from("prod_proyecto_muebles").update(patch).eq("empresa_id", ctx.auth.empresa_id).eq("proyecto_id", id).eq("id", muebleId).select("id").single();
    if (up.error) return NextResponse.json(errorResponse(up.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id: muebleId }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, p: Params) {
  try {
    const { id, muebleId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const del = await ctx.supabase.from("prod_proyecto_muebles").delete().eq("empresa_id", ctx.auth.empresa_id).eq("proyecto_id", id).eq("id", muebleId);
    if (del.error) return NextResponse.json(errorResponse(del.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id: muebleId }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
