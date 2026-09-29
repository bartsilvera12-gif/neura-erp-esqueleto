import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx } from "@/lib/comex/server";
import { saldosBancos, saldosCajas } from "@/lib/tesoreria/server";

const BANCO_COLS = "id, nombre, tipo, numero_cuenta, moneda, titular, saldo_inicial, fecha_saldo_inicial, cuenta_contable_codigo, activo";
const CAJA_COLS = "id, nombre, moneda, tope_gasto, fondo_fijo, responsable_id, responsable_nombre, cuenta_contable_codigo, activa";

/** GET — cuentas bancarias y cajas chicas con su saldo. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const [bancos, cajas, sb, sc] = await Promise.all([
      ctx.supabase.from("entidades_bancarias").select(BANCO_COLS).eq("empresa_id", emp).eq("tipo", "banco").order("nombre"),
      ctx.supabase.from("cajas_chicas").select(CAJA_COLS).eq("empresa_id", emp).order("nombre"),
      saldosBancos(ctx.supabase, emp),
      saldosCajas(ctx.supabase, emp),
    ]);
    const err = bancos.error ?? cajas.error;
    if (err) throw new Error(err.message);
    return NextResponse.json(
      successResponse({
        bancos: ((bancos.data ?? []) as unknown as { id: string }[]).map((b) => ({ ...b, saldo: sb.get(b.id) ?? 0 })),
        cajas: ((cajas.data ?? []) as unknown as { id: string }[]).map((c) => ({ ...c, saldo: sc.get(c.id) ?? 0 })),
      })
    );
  } catch (err) {
    console.error("[/api/tesoreria GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar las cuentas."), { status: 500 });
  }
}
