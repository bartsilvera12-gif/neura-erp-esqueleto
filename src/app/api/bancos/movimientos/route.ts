import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const TIPOS = new Set(["retiro", "deposito", "transferencia_in", "transferencia_out", "ajuste"]);

const COLS =
  "id, empresa_id, entidad_bancaria_id, tipo, monto, moneda, fecha, referencia, observacion, " +
  "entidad_contraparte_id, gasto_id, created_by_user_id, usuario_nombre, created_at";

/**
 * GET /api/bancos/movimientos — listado de movimientos bancarios.
 * Query opcional: ?entidad_id=<uuid>&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&tipo=<tipo>
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const sp = new URL(request.url).searchParams;
    let q = ctx.supabase
      .from("banco_movimientos")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    const entidadId = sp.get("entidad_id");
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const tipo = sp.get("tipo");
    if (entidadId) q = q.eq("entidad_bancaria_id", entidadId);
    if (desde) q = q.gte("fecha", desde);
    if (hasta) q = q.lte("fecha", hasta);
    if (tipo && TIPOS.has(tipo)) q = q.eq("tipo", tipo);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ movimientos: data ?? [] }));
  } catch (err) {
    console.error("[/api/bancos/movimientos GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los movimientos."), { status: 500 });
  }
}

/** POST /api/bancos/movimientos — registrar un movimiento bancario. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const tipo = String(body.tipo ?? "").trim();
    const entidadBancariaId = String(body.entidad_bancaria_id ?? "").trim();
    const monto = Number(body.monto);
    if (!TIPOS.has(tipo)) return NextResponse.json(errorResponse("Tipo inválido."), { status: 400 });
    if (!entidadBancariaId) return NextResponse.json(errorResponse("Entidad bancaria requerida."), { status: 400 });
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json(errorResponse("Monto inválido."), { status: 400 });
    }

    const fecha = typeof body.fecha === "string" && body.fecha ? body.fecha : new Date().toISOString().slice(0, 10);
    const moneda = ["PYG", "USD"].includes(String(body.moneda)) ? String(body.moneda) : "PYG";
    const referencia = body.referencia ? String(body.referencia).trim().slice(0, 100) : null;
    const observacion = body.observacion ? String(body.observacion).trim().slice(0, 500) : null;
    const contraparte = body.entidad_contraparte_id ? String(body.entidad_contraparte_id) : null;
    const gastoId = body.gasto_id ? String(body.gasto_id) : null;

    const { data, error } = await ctx.supabase
      .from("banco_movimientos")
      .insert({
        empresa_id: ctx.auth.empresa_id,
        entidad_bancaria_id: entidadBancariaId,
        tipo,
        monto,
        moneda,
        fecha,
        referencia,
        observacion,
        entidad_contraparte_id: contraparte,
        gasto_id: gastoId,
        created_by_user_id: ctx.auth.usuarioCatalogId ?? null,
        usuario_nombre: ctx.auth.nombre ?? ctx.auth.user?.email ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json(successResponse({ id: (data as { id: string }).id }));
  } catch (err) {
    console.error("[/api/bancos/movimientos POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "Error interno"),
      { status: 500 },
    );
  }
}
