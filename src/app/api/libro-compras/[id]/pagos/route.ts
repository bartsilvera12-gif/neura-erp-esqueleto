import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { esUuid, getComexCtx } from "@/lib/comex/server";
import { anularPago, ErrorTesoreria, pagosVigentes, registrarPago } from "@/lib/tesoreria/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    return NextResponse.json(successResponse({ pagos: await pagosVigentes(ctx.supabase, ctx.auth.empresa_id, id) }));
  } catch (err) {
    console.error("[/api/libro-compras/:id/pagos GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar los pagos."), { status: 500 });
  }
}

/** POST { cuota_nro, fecha, monto, medio, cuenta_id, referencia } — pagar (una parte de) una cuota. */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nro = Number(b.cuota_nro);
    if (!(Number.isInteger(nro) && nro > 0)) return NextResponse.json(errorResponse("Elegí la cuota."), { status: 400 });
    const { data: q } = await ctx.supabase
      .from("libro_compras_cuotas")
      .select("monto, pagado")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("compra_id", id)
      .eq("nro", nro)
      .maybeSingle();
    const cuota = q as { monto: number; pagado: number } | null;
    if (!cuota) return NextResponse.json(errorResponse("La cuota no existe."), { status: 404 });
    const monto = Number(b.monto);
    const saldo = Number(cuota.monto) - Number(cuota.pagado);
    if (!(monto > 0)) return NextResponse.json(errorResponse("El monto tiene que ser mayor a 0."), { status: 400 });
    if (monto > saldo + 0.001) return NextResponse.json(errorResponse(`A la cuota ${nro} le quedan ${saldo.toLocaleString("es-PY")} por pagar.`), { status: 400 });
    if (!esUuid(b.cuenta_id)) return NextResponse.json(errorResponse("Elegí de dónde sale el dinero."), { status: 400 });
    const r = await registrarPago(ctx.supabase, ctx.auth, {
      compraId: id,
      cuotaNro: nro,
      fecha: String(b.fecha ?? "").slice(0, 10),
      monto,
      medio: b.medio === "CAJA_CHICA" ? "CAJA_CHICA" : "BANCO",
      cuentaId: b.cuenta_id,
      referencia: b.referencia ? String(b.referencia).trim().slice(0, 60) : null,
    });
    return NextResponse.json(successResponse(r));
  } catch (err) {
    if (err instanceof ErrorTesoreria) return NextResponse.json(errorResponse(err.message), { status: 400 });
    console.error("[/api/libro-compras/:id/pagos POST]", err);
    return NextResponse.json(errorResponse("No se pudo registrar el pago."), { status: 500 });
  }
}

/** DELETE ?pagoId=&motivo= — anula un pago de cuota (solo admin). */
export async function DELETE(request: NextRequest, p: Params) {
  try {
    await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede anular pagos."), { status: 403 });
    const sp = new URL(request.url).searchParams;
    const pagoId = sp.get("pagoId");
    const motivo = (sp.get("motivo") ?? "").trim();
    if (!esUuid(pagoId)) return NextResponse.json(errorResponse("Falta el pago."), { status: 400 });
    if (!motivo) return NextResponse.json(errorResponse("Escribí el motivo."), { status: 400 });
    await anularPago(ctx.supabase, ctx.auth, pagoId, motivo);
    return NextResponse.json(successResponse({ id: pagoId }));
  } catch (err) {
    if (err instanceof ErrorTesoreria) return NextResponse.json(errorResponse(err.message), { status: 400 });
    console.error("[/api/libro-compras/:id/pagos DELETE]", err);
    return NextResponse.json(errorResponse("No se pudo anular el pago."), { status: 500 });
  }
}
