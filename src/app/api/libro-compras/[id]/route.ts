import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx } from "@/lib/comex/server";
import { COMPRA_COLS, ErrorValidacion, guardarCompra } from "@/lib/compras-libro/server";

type Params = { params: Promise<{ id: string }> };

/** GET: el comprobante con sus renglones y cuotas. */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const [c, l, q] = await Promise.all([
      ctx.supabase.from("libro_compras").select(COMPRA_COLS).eq("empresa_id", emp).eq("id", id).maybeSingle(),
      ctx.supabase
        .from("libro_compras_lineas")
        .select("cuenta_codigo, centro_costo, programa, explicacion, exentas, gravadas, iva_porcentaje, imputa_iva, formulario")
        .eq("empresa_id", emp)
        .eq("compra_id", id)
        .order("orden"),
      ctx.supabase.from("libro_compras_cuotas").select("nro, pagare, vencimiento, monto, pagado").eq("empresa_id", emp).eq("compra_id", id).order("nro"),
    ]);
    const err = c.error ?? l.error ?? q.error;
    if (err) throw new Error(err.message);
    if (!c.data) return NextResponse.json(errorResponse("El comprobante no existe."), { status: 404 });
    return NextResponse.json(successResponse({ compra: c.data, lineas: l.data ?? [], cuotas: q.data ?? [] }));
  } catch (err) {
    console.error("[/api/libro-compras/:id GET]", err);
    return NextResponse.json(errorResponse("No se pudo cargar el comprobante."), { status: 500 });
  }
}

/** PUT: guarda el comprobante completo (cabecera, renglones y cuotas). */
export async function PUT(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const r = await guardarCompra(ctx.supabase, ctx.auth, body, id);
    return NextResponse.json(successResponse(r));
  } catch (err) {
    if (err instanceof ErrorValidacion) return NextResponse.json(errorResponse(err.message), { status: 400 });
    console.error("[/api/libro-compras/:id PUT]", err);
    return NextResponse.json(errorResponse("No se pudo guardar el comprobante."), { status: 500 });
  }
}
