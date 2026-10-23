import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Params = { params: Promise<{ id: string }> };

/** PUT — guarda el precio de venta, descuento e ingreso final del proyecto (spec 5.9). */
export async function PUT(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.precio_venta !== undefined) patch.precio_venta = Number(b.precio_venta) || 0;
    if (b.descuento_venta !== undefined) patch.descuento_venta = Number(b.descuento_venta) || 0;
    if (b.ingreso_final !== undefined) patch.ingreso_final = Number(b.ingreso_final) || 0;

    const upd = await ctx.supabase.from("prod_proyectos").update(patch).eq("empresa_id", emp).eq("id", id);
    if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
