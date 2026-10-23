import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Params = { params: Promise<{ id: string }> };

/** GET — lista de materiales (requeridos) del proyecto. */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase.from("prod_proyecto_materiales")
      .select("id, articulo_tipo, articulo_id, descripcion, unidad, cantidad_requerida, observaciones")
      .eq("empresa_id", ctx.auth.empresa_id).eq("proyecto_id", id).order("created_at");
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ materiales: data ?? [] }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** POST — agrega un material a la lista del proyecto (jalado del catálogo). */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const pq = await ctx.supabase.from("prod_proyectos").select("id").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (pq.error || !pq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const articulo_tipo = b.articulo_tipo === "tablero" ? "tablero" : "herraje";
    const articulo_id = String(b.articulo_id ?? "").trim();
    if (!articulo_id) return NextResponse.json(errorResponse("Elegí el artículo del catálogo."), { status: 400 });
    const cantidad = Math.abs(Number(b.cantidad_requerida) || 0);
    if (cantidad <= 0) return NextResponse.json(errorResponse("La cantidad debe ser mayor que cero."), { status: 400 });

    const ins = await ctx.supabase.from("prod_proyecto_materiales").insert({
      empresa_id: emp, proyecto_id: id, articulo_tipo, articulo_id,
      descripcion: String(b.descripcion ?? "").trim() || null,
      unidad: String(b.unidad ?? "").trim() || null,
      cantidad_requerida: cantidad, observaciones: String(b.observaciones ?? "").trim() || null,
    }).select("id").single();
    if (ins.error) return NextResponse.json(errorResponse(ins.error.message), { status: 400 });
    return NextResponse.json(successResponse({ material: ins.data }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
