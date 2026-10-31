import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, traerTodo } from "@/lib/comex/server";

/** GET — cuotas de compras a crédito ya saldadas (saldo 0), de la pagada más reciente a la más vieja. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;

    const data = await traerTodo<Record<string, unknown> & { monto: number; pagado: number; compra_id: string; nro: number; libro_compras: Record<string, unknown> }>((a, b) =>
      ctx.supabase
        .from("libro_compras_cuotas")
        .select("nro, vencimiento, monto, pagado, compra_id, libro_compras!inner(id, numero_control, nro_comprobante, proveedor_nombre, proveedor_ruc, moneda, tipo_nombre, fecha, estado)")
        .eq("empresa_id", emp)
        .eq("libro_compras.estado", "registrada")
        .order("compra_id")
        .order("nro")
        .range(a, b)
    );
    const saldadas = data.filter((c) => Number(c.monto) > 0 && Number(c.monto) - Number(c.pagado) <= 0.001);
    if (saldadas.length === 0) return NextResponse.json(successResponse({ cuotas: [] }));

    // Datos del pago por cuota: fecha (la última) y medio.
    const compraIds = [...new Set(saldadas.map((c) => c.compra_id))];
    const pagos = await traerTodo<{ compra_id: string; cuota_nro: number | null; fecha: string; medio: string }>((a, b) =>
      ctx.supabase
        .from("libro_compras_pagos")
        .select("compra_id, cuota_nro, fecha, medio")
        .eq("empresa_id", emp)
        .eq("estado", "vigente")
        .in("compra_id", compraIds)
        .order("fecha")
        .range(a, b)
    );
    const pagoDe = new Map<string, { fecha: string; medio: string }>();
    for (const p of pagos) {
      if (p.cuota_nro === null) continue;
      pagoDe.set(`${p.compra_id}-${p.cuota_nro}`, { fecha: p.fecha, medio: p.medio }); // ordenado por fecha asc → queda la última
    }

    const cuotas = saldadas
      .map(({ libro_compras, ...c }) => {
        const info = pagoDe.get(`${c.compra_id}-${c.nro}`) ?? null;
        return { ...c, saldo: 0, fecha_pago: info?.fecha ?? null, medio: info?.medio ?? null, compra: libro_compras };
      })
      .sort((x, y) => (y.fecha_pago ?? "").localeCompare(x.fecha_pago ?? ""));
    return NextResponse.json(successResponse({ cuotas }));
  } catch (err) {
    console.error("[/api/libro-compras/pagadas GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar las facturas pagadas."), { status: 500 });
  }
}
