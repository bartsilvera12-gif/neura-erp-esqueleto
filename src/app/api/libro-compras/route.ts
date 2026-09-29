import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esUuid, getComexCtx, textoBusqueda } from "@/lib/comex/server";
import { COMPRA_COLS, ErrorValidacion, guardarCompra } from "@/lib/compras-libro/server";

/** GET ?desde=&hasta=&tipo=&estado=&q= — comprobantes del libro de compras. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sp = new URL(request.url).searchParams;
    let q = ctx.supabase
      .from("libro_compras")
      .select(COMPRA_COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000);
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) q = q.gte("fecha", desde);
    if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) q = q.lte("fecha", hasta);
    const tipo = sp.get("tipo");
    if (esUuid(tipo)) q = q.eq("tipo_id", tipo);
    const estado = sp.get("estado");
    if (estado === "registrada" || estado === "anulada") q = q.eq("estado", estado);
    const busca = textoBusqueda(sp.get("q"));
    if (busca) q = q.or(`proveedor_nombre.ilike.%${busca}%,nro_comprobante.ilike.%${busca}%,numero_control.ilike.%${busca}%,proveedor_ruc.ilike.%${busca}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ compras: data ?? [] }));
  } catch (err) {
    console.error("[/api/libro-compras GET]", err);
    return NextResponse.json(errorResponse("No se pudo cargar el libro de compras."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const r = await guardarCompra(ctx.supabase, ctx.auth, body);
    return NextResponse.json(successResponse(r));
  } catch (err) {
    if (err instanceof ErrorValidacion) return NextResponse.json(errorResponse(err.message), { status: 400 });
    console.error("[/api/libro-compras POST]", err);
    return NextResponse.json(errorResponse("No se pudo guardar el comprobante."), { status: 500 });
  }
}
