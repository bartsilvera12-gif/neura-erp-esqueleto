import { NextRequest, NextResponse } from "next/server";
import { getComexCtx } from "@/lib/comex/server";
import { signoCaja } from "@/lib/tesoreria/server";
import { reporteCuentaHTML, type MovReporte } from "@/lib/tesoreria/reporte";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/tesoreria/cajas/[id]/reporte?desde=&hasta=&auto=1
 * Reporte histórico imprimible de la caja chica: movimientos + total de
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

  const cja = await ctx.supabase
    .from("cajas_chicas")
    .select("nombre, moneda")
    .eq("empresa_id", emp).eq("id", id).maybeSingle();
  if (cja.error || !cja.data) return new NextResponse("Caja no encontrada", { status: 404 });
  const c = cja.data as { nombre: string; moneda: string | null };

  const movs = await ctx.supabase
    .from("caja_chica_movimientos")
    .select("tipo, monto, fecha, referencia, observacion")
    .eq("empresa_id", emp).eq("caja_chica_id", id)
    .order("fecha").order("created_at");
  if (movs.error) return new NextResponse("No se pudieron leer los movimientos", { status: 500 });

  const html = reporteCuentaHTML({
    titulo: "REPORTE DE CAJA CHICA",
    cuentaNombre: c.nombre,
    moneda: c.moneda ?? "PYG",
    saldoInicial: 0,
    movimientos: (movs.data ?? []) as unknown as MovReporte[],
    desde, hasta,
    signo: signoCaja,
    auto,
  });
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
