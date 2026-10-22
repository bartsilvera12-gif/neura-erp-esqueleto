import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Params = { params: Promise<{ presId: string }> };

/** GET — cabecera del presupuesto + sus líneas. */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { presId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const pq = await ctx.supabase.from("prod_presupuestos").select("*").eq("empresa_id", emp).eq("id", presId).maybeSingle();
    if (pq.error || !pq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const lq = await ctx.supabase.from("prod_presupuesto_lineas").select("id, tipo_costo, articulo_id, descripcion, unidad, cantidad, costo_unitario, subtotal, observaciones").eq("empresa_id", emp).eq("presupuesto_id", presId).order("created_at");
    return NextResponse.json(successResponse({ presupuesto: pq.data, lineas: lq.data ?? [] }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** DELETE — borra una versión en borrador. */
export async function DELETE(request: NextRequest, p: Params) {
  try {
    const { presId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const q = await ctx.supabase.from("prod_presupuestos").select("estado").eq("empresa_id", emp).eq("id", presId).maybeSingle();
    if (q.error || !q.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    if ((q.data as { estado: string }).estado !== "borrador") return NextResponse.json(errorResponse("Solo se puede borrar una versión en borrador."), { status: 400 });
    const del = await ctx.supabase.from("prod_presupuestos").delete().eq("empresa_id", emp).eq("id", presId);
    if (del.error) return NextResponse.json(errorResponse(del.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id: presId }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
