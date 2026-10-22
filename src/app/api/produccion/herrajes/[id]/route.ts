import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Params = { params: Promise<{ id: string }> };
const CAMPOS = ["codigo","descripcion","categoria","marca_modelo","especificacion","unidad","proveedor_id","stock_minimo","costo_referencia","activo","observaciones"] as const;

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
      if (k === "codigo" || k === "descripcion") { const s = String(v ?? "").trim(); if (!s) return NextResponse.json(errorResponse(`El campo ${k} no puede quedar vacío.`), { status: 400 }); patch[k] = s; }
      else if (k === "unidad") patch[k] = String(v ?? "").trim().toUpperCase() || "UNIDAD";
      else if (["stock_minimo","costo_referencia"].includes(k)) patch[k] = Number(v) || 0;
      else if (k === "activo") patch[k] = v !== false;
      else patch[k] = v ? String(v).trim() : null;
    }
    const up = await ctx.supabase.from("prod_herrajes").update(patch).eq("empresa_id", ctx.auth.empresa_id).eq("id", id).select("id").single();
    if (up.error) {
      const dup = (up.error as { code?: string }).code === "23505";
      return NextResponse.json(errorResponse(dup ? "Ya existe un herraje con ese código." : up.error.message), { status: 400 });
    }
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
    const up = await ctx.supabase.from("prod_herrajes").update({ activo: false, updated_at: new Date().toISOString() }).eq("empresa_id", ctx.auth.empresa_id).eq("id", id);
    if (up.error) return NextResponse.json(errorResponse(up.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
