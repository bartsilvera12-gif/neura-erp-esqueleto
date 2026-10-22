import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Params = { params: Promise<{ id: string }> };
const CAMPOS = ["nombre","identificacion","contacto","telefono","especialidad","activo","observaciones"] as const;

export async function PUT(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of CAMPOS) {
      if (!(k in b)) continue;
      const v = b[k];
      if (k === "nombre") { const s = String(v ?? "").trim(); if (!s) return NextResponse.json(errorResponse("El nombre no puede quedar vacío."), { status: 400 }); patch[k] = s; }
      else if (k === "activo") patch[k] = v !== false;
      else patch[k] = v ? String(v).trim() : null;
    }
    const up = await ctx.supabase.from("prod_contratistas").update(patch).eq("empresa_id", ctx.auth.empresa_id).eq("id", id).select("id").single();
    if (up.error) return NextResponse.json(errorResponse(up.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const up = await ctx.supabase.from("prod_contratistas").update({ activo: false, updated_at: new Date().toISOString() }).eq("empresa_id", ctx.auth.empresa_id).eq("id", id);
    if (up.error) return NextResponse.json(errorResponse(up.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
