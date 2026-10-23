import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Params = { params: Promise<{ notaId: string }> };

/** POST — agrega una línea a la nota (solo en borrador). */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { notaId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;

    const nq = await ctx.supabase.from("prod_notas_entrega").select("estado, tipo").eq("empresa_id", emp).eq("id", notaId).maybeSingle();
    if (nq.error || !nq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    if ((nq.data as { estado: string }).estado !== "borrador") return NextResponse.json(errorResponse("La nota ya no está en borrador."), { status: 400 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const articulo_tipo = b.articulo_tipo === "herraje" ? "herraje" : "tablero";
    const articulo_id = String(b.articulo_id ?? "").trim();
    if (!articulo_id) return NextResponse.json(errorResponse("Elegí el artículo."), { status: 400 });
    const cantidad = Math.abs(Number(b.cantidad) || 0);
    if (cantidad <= 0) return NextResponse.json(errorResponse("La cantidad debe ser mayor que cero."), { status: 400 });
    const condicion = b.condicion === "danada" ? "danada" : "buena";

    const ins = await ctx.supabase.from("prod_nota_entrega_detalle").insert({
      empresa_id: emp, nota_id: notaId, articulo_tipo, articulo_id,
      descripcion: String(b.descripcion ?? "").trim() || null,
      cantidad, unidad: String(b.unidad ?? "").trim() || null, condicion,
      observaciones: String(b.observaciones ?? "").trim() || null,
    }).select("id").single();
    if (ins.error) return NextResponse.json(errorResponse(ins.error.message), { status: 400 });
    return NextResponse.json(successResponse({ linea: ins.data }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
