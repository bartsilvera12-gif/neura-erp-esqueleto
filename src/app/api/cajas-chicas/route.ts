import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS = "id, empresa_id, sucursal_id, nombre, moneda, tope_gasto, activa, created_at, updated_at";

/**
 * GET /api/cajas-chicas — listado con saldo actual.
 * Saldo: SUM(monto_signed) donde signed = monto para aporte/saldo_inicial,
 * -monto para gasto/retiro; ajuste usa el signo del monto ingresado.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;

    const [cajasQ, movsQ] = await Promise.all([
      ctx.supabase
        .from("cajas_chicas")
        .select(COLS)
        .eq("empresa_id", empresaId)
        .order("nombre", { ascending: true }),
      ctx.supabase
        .from("caja_chica_movimientos")
        .select("caja_chica_id, tipo, monto")
        .eq("empresa_id", empresaId),
    ]);
    if (cajasQ.error) throw new Error(cajasQ.error.message);
    if (movsQ.error) throw new Error(movsQ.error.message);

    const saldos = new Map<string, number>();
    for (const m of (movsQ.data ?? []) as Array<{ caja_chica_id: string; tipo: string; monto: number | string }>) {
      const monto = Number(m.monto ?? 0);
      const signed = m.tipo === "aporte" || m.tipo === "saldo_inicial" ? monto : m.tipo === "ajuste" ? monto : -monto;
      saldos.set(m.caja_chica_id, (saldos.get(m.caja_chica_id) ?? 0) + signed);
    }

    const cajas = ((cajasQ.data ?? []) as Array<Record<string, unknown>>).map((c) => ({
      ...c,
      saldo_actual: saldos.get(String(c.id)) ?? 0,
    }));

    return NextResponse.json(successResponse({ cajas }));
  } catch (err) {
    console.error("[/api/cajas-chicas GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar las cajas chicas."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = String(b.nombre ?? "").trim();
    if (!nombre) return NextResponse.json(errorResponse("Nombre requerido."), { status: 400 });
    const moneda = ["PYG", "USD"].includes(String(b.moneda)) ? String(b.moneda) : "PYG";
    const topeRaw = b.tope_gasto === "" || b.tope_gasto === null || b.tope_gasto === undefined ? null : Number(b.tope_gasto);
    const tope = topeRaw !== null && Number.isFinite(topeRaw) && topeRaw > 0 ? topeRaw : null;

    const { data, error } = await ctx.supabase
      .from("cajas_chicas")
      .insert({
        empresa_id: ctx.auth.empresa_id,
        sucursal_id: b.sucursal_id ? String(b.sucursal_id) : null,
        nombre,
        moneda,
        tope_gasto: tope,
        activa: b.activa === false ? false : true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id: (data as { id: string }).id }));
  } catch (err) {
    console.error("[/api/cajas-chicas POST]", err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "Error interno"),
      { status: 500 },
    );
  }
}
