import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx } from "@/lib/comex/server";
import { signoCaja } from "@/lib/tesoreria/server";

/** GET — la caja con sus movimientos (saldo corrido) y sus arqueos. */
export async function GET(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const [caja, movs, arq] = await Promise.all([
      ctx.supabase.from("cajas_chicas").select("id, nombre, moneda, tope_gasto, fondo_fijo, responsable_id, responsable_nombre, cuenta_contable_codigo, activa").eq("empresa_id", emp).eq("id", id).maybeSingle(),
      ctx.supabase
        .from("caja_chica_movimientos")
        .select("id, tipo, monto, fecha, referencia, observacion, compra_id, arqueo_id, transferencia_grupo, usuario_nombre, created_at")
        .eq("empresa_id", emp)
        .eq("caja_chica_id", id)
        .order("fecha")
        .order("created_at"),
      ctx.supabase.from("caja_chica_arqueos").select("id, fecha, saldo_sistema, contado, diferencia, observacion, ajuste_movimiento_id, usuario_nombre").eq("empresa_id", emp).eq("caja_chica_id", id).order("fecha", { ascending: false }),
    ]);
    const err = caja.error ?? movs.error ?? arq.error;
    if (err) throw new Error(err.message);
    if (!caja.data) return NextResponse.json(errorResponse("La caja no existe."), { status: 404 });
    let saldo = 0;
    const lista = ((movs.data ?? []) as { tipo: string; monto: number }[]).map((m) => {
      saldo += signoCaja(m.tipo, Number(m.monto));
      return { ...m, saldo };
    });
    return NextResponse.json(successResponse({ caja: caja.data, movimientos: lista.reverse(), saldo, arqueos: arq.data ?? [] }));
  } catch (err) {
    console.error("[/api/tesoreria/cajas/:id/movimientos GET]", err);
    return NextResponse.json(errorResponse("No se pudo cargar la caja."), { status: 500 });
  }
}
