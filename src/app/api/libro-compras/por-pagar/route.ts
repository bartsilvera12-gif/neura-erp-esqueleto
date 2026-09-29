import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx } from "@/lib/comex/server";

/** GET — cuotas con saldo pendiente de compras a crédito vigentes, por vencimiento. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const { data, error } = await ctx.supabase
      .from("libro_compras_cuotas")
      .select("nro, vencimiento, monto, pagado, pagare, compra_id, libro_compras!inner(id, numero_control, nro_comprobante, proveedor_nombre, proveedor_ruc, moneda, tipo_nombre, fecha, estado)")
      .eq("empresa_id", emp)
      .eq("libro_compras.estado", "registrada")
      .order("vencimiento");
    if (error) throw new Error(error.message);
    const cuotas = ((data ?? []) as unknown as Array<Record<string, unknown> & { monto: number; pagado: number; libro_compras: Record<string, unknown> }>)
      .filter((c) => Number(c.monto) - Number(c.pagado) > 0.001)
      .map(({ libro_compras, ...c }) => ({ ...c, saldo: Number(c.monto) - Number(c.pagado), compra: libro_compras }));
    return NextResponse.json(successResponse({ cuotas }));
  } catch (err) {
    console.error("[/api/libro-compras/por-pagar GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar las cuentas por pagar."), { status: 500 });
  }
}
