import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx } from "@/lib/comex/server";

/** GET — el conteo con todos sus productos. */
export async function GET(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const [c, it] = await Promise.all([
      ctx.supabase.from("inventario_conteos").select("*").eq("empresa_id", emp).eq("id", id).maybeSingle(),
      ctx.supabase
        .from("inventario_conteo_items")
        .select("id, producto_id, producto_nombre, sku, categoria_nombre, stock_sistema, cantidad_fisica, motivo, contado_por_nombre, contado_at, ajustado")
        .eq("empresa_id", emp)
        .eq("conteo_id", id)
        .order("producto_nombre"),
    ]);
    const err = c.error ?? it.error;
    if (err) throw new Error(err.message);
    if (!c.data) return NextResponse.json(errorResponse("El conteo no existe."), { status: 404 });
    return NextResponse.json(successResponse({ conteo: c.data, items: it.data ?? [] }));
  } catch (err) {
    console.error("[/api/comex/conteos/:id GET]", err);
    return NextResponse.json(errorResponse("No se pudo cargar el conteo."), { status: 500 });
  }
}
