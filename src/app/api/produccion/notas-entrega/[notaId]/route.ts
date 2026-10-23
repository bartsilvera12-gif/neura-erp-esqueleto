import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { signProduccionArchivo } from "@/lib/produccion/archivos-storage";

type Params = { params: Promise<{ notaId: string }> };

/** GET — cabecera de la nota + detalle + URL firmada de la firma. */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { notaId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;
    const nq = await sb.from("prod_notas_entrega").select("*").eq("empresa_id", emp).eq("id", notaId).maybeSingle();
    if (nq.error || !nq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const dq = await sb.from("prod_nota_entrega_detalle").select("id, articulo_tipo, articulo_id, descripcion, cantidad, unidad, condicion, movimiento_id, observaciones").eq("empresa_id", emp).eq("nota_id", notaId).order("created_at");
    const n = nq.data as Record<string, unknown>;
    const firma_url = n.firma_path ? await signProduccionArchivo(sb, String(n.firma_path)) : null;
    return NextResponse.json(successResponse({ nota: n, detalle: dq.data ?? [], firma_url }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** DELETE — borra una nota en borrador. */
export async function DELETE(request: NextRequest, p: Params) {
  try {
    const { notaId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const q = await ctx.supabase.from("prod_notas_entrega").select("estado").eq("empresa_id", emp).eq("id", notaId).maybeSingle();
    if (q.error || !q.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    if ((q.data as { estado: string }).estado !== "borrador") return NextResponse.json(errorResponse("Solo se puede borrar una nota en borrador."), { status: 400 });
    const del = await ctx.supabase.from("prod_notas_entrega").delete().eq("empresa_id", emp).eq("id", notaId);
    if (del.error) return NextResponse.json(errorResponse(del.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id: notaId }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
