import { NextRequest, NextResponse } from "next/server";
import { getComexCtx } from "@/lib/comex/server";
import { signoBanco } from "@/lib/tesoreria/server";
import { reporteCuentaHTML, type MovReporte } from "@/lib/tesoreria/reporte";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/tesoreria/bancos/[id]/reporte?desde=&hasta=&auto=1
 * Reporte histórico imprimible de la cuenta bancaria: movimientos + total de
 * ingresos vs egresos y neto.
 */
export async function GET(request: NextRequest, p: Params) {
  const { id } = await p.params;
  const url = new URL(request.url);
  const auto = url.searchParams.get("auto") === "1";
  const desde = url.searchParams.get("desde");
  const hasta = url.searchParams.get("hasta");

  const ctx = await getComexCtx(request);
  if (!ctx) return new NextResponse("No autorizado", { status: 401 });
  const emp = ctx.auth.empresa_id;

  const cta = await ctx.supabase
    .from("entidades_bancarias")
    .select("nombre, moneda, saldo_inicial, fecha_saldo_inicial")
    .eq("empresa_id", emp).eq("id", id).maybeSingle();
  if (cta.error || !cta.data) return new NextResponse("Cuenta no encontrada", { status: 404 });
  const c = cta.data as { nombre: string; moneda: string | null; saldo_inicial: number; fecha_saldo_inicial: string | null };

  const movs = await ctx.supabase
    .from("banco_movimientos")
    .select("tipo, monto, fecha, referencia, observacion")
    .eq("empresa_id", emp).eq("entidad_bancaria_id", id)
    .order("fecha").order("created_at");
  if (movs.error) return new NextResponse("No se pudieron leer los movimientos", { status: 500 });

  const html = reporteCuentaHTML({
    titulo: "REPORTE DE CUENTA BANCARIA",
    cuentaNombre: c.nombre,
    moneda: c.moneda ?? "PYG",
    saldoInicial: Number(c.saldo_inicial) || 0,
    fechaSaldoInicial: c.fecha_saldo_inicial,
    movimientos: (movs.data ?? []) as unknown as MovReporte[],
    desde, hasta,
    signo: signoBanco,
    auto,
  });
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
