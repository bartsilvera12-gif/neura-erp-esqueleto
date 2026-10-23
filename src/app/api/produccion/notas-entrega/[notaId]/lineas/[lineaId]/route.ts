import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Params = { params: Promise<{ notaId: string; lineaId: string }> };

/** DELETE — elimina una línea de la nota (solo en borrador). */
export async function DELETE(request: NextRequest, p: Params) {
  try {
    const { notaId, lineaId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const nq = await ctx.supabase.from("prod_notas_entrega").select("estado").eq("empresa_id", emp).eq("id", notaId).maybeSingle();
    if (nq.error || !nq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    if ((nq.data as { estado: string }).estado !== "borrador") return NextResponse.json(errorResponse("La nota ya no está en borrador."), { status: 400 });
    const del = await ctx.supabase.from("prod_nota_entrega_detalle").delete().eq("empresa_id", emp).eq("nota_id", notaId).eq("id", lineaId);
    if (del.error) return NextResponse.json(errorResponse(del.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id: lineaId }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
