import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, registrarHistorial } from "@/lib/comex/server";

const COLS =
  "id, importacion_id, tipo, concepto, monto, moneda, tipo_cambio, fecha, referencia, observacion, banco_movimiento_id, usuario_nombre, created_at";

const MONEDAS = new Set(["PYG", "USD", "BOB"]);

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("importacion_caja")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("importacion_id", id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ movimientos: data ?? [] }));
  } catch (err) {
    console.error("[/api/importaciones/:id/caja GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar los movimientos."), { status: 500 });
  }
}

export async function POST(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const tipo = String(b.tipo ?? "").trim();
    const concepto = String(b.concepto ?? "").trim();
    const monto = Number(b.monto);
    const moneda = String(b.moneda ?? "USD").toUpperCase();
    if (tipo !== "entrada" && tipo !== "salida") {
      return NextResponse.json(errorResponse("Tipo inválido."), { status: 400 });
    }
    if (!concepto) return NextResponse.json(errorResponse("Concepto requerido."), { status: 400 });
    if (!(monto > 0)) return NextResponse.json(errorResponse("Monto inválido."), { status: 400 });
    if (!MONEDAS.has(moneda)) return NextResponse.json(errorResponse("Moneda no soportada."), { status: 400 });
    const { data: imp } = await ctx.supabase.from("importaciones").select("estado").eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle();
    if (!imp) return NextResponse.json(errorResponse("Importación no encontrada."), { status: 404 });
    const est = (imp as { estado: string }).estado;
    if (est === "anulada" || est === "cerrada")
      return NextResponse.json(errorResponse("La importación está cerrada o anulada."), { status: 400 });

    const { data, error } = await ctx.supabase
      .from("importacion_caja")
      .insert({
        empresa_id: ctx.auth.empresa_id,
        importacion_id: id,
        tipo,
        concepto: concepto.slice(0, 200),
        monto,
        moneda,
        tipo_cambio: Number(b.tipo_cambio) || 1,
        fecha: typeof b.fecha === "string" && b.fecha ? b.fecha : new Date().toISOString().slice(0, 10),
        referencia: b.referencia ? String(b.referencia).trim().slice(0, 100) : null,
        observacion: b.observacion ? String(b.observacion).slice(0, 500) : null,
        banco_movimiento_id: b.banco_movimiento_id ? String(b.banco_movimiento_id) : null,
        created_by_user_id: ctx.auth.usuarioCatalogId ?? null,
        usuario_nombre: ctx.auth.nombre ?? ctx.auth.user?.email ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await registrarHistorial(ctx.supabase, ctx.auth, "IMPORTACION", id, "MOVIMIENTO_CAJA", { tipo, concepto, monto, moneda });
    return NextResponse.json(successResponse({ id: (data as { id: string }).id }));
  } catch (err) {
    console.error("[/api/importaciones/:id/caja POST]", err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "Error interno"),
      { status: 500 },
    );
  }
}
