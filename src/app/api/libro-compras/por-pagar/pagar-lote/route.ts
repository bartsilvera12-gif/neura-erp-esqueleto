import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esUuid, getComexCtx } from "@/lib/comex/server";
import { ErrorTesoreria, registrarPago, validarMovimiento } from "@/lib/tesoreria/server";

type ItemBody = { compra_id: string; cuota_nro: number };

/**
 * POST { items:[{compra_id, cuota_nro}], medio, cuenta_id, fecha, referencia }
 * Paga en bloque el saldo de varias cuotas con un solo origen de dinero.
 * Todas las cuotas tienen que ser de la misma moneda (una cuenta es de una moneda).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const items = Array.isArray(b.items) ? (b.items as unknown[]) : [];
    const pedidos: ItemBody[] = [];
    for (const it of items) {
      const o = (it ?? {}) as Record<string, unknown>;
      const nro = Number(o.cuota_nro);
      if (!esUuid(o.compra_id) || !(Number.isInteger(nro) && nro > 0))
        return NextResponse.json(errorResponse("Hay cuotas inválidas en la selección."), { status: 400 });
      pedidos.push({ compra_id: String(o.compra_id), cuota_nro: nro });
    }
    if (pedidos.length === 0) return NextResponse.json(errorResponse("Elegí al menos una cuota."), { status: 400 });
    if (!esUuid(b.cuenta_id)) return NextResponse.json(errorResponse("Elegí de dónde sale el dinero."), { status: 400 });
    const fecha = String(b.fecha ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json(errorResponse("Falta la fecha del pago."), { status: 400 });
    const medio = b.medio === "CAJA_CHICA" ? "CAJA_CHICA" : "BANCO";
    const referencia = b.referencia ? String(b.referencia).trim().slice(0, 60) : null;

    // Traigo el saldo real de cada cuota y la moneda de su compra.
    const compraIds = [...new Set(pedidos.map((p) => p.compra_id))];
    const { data: cuotasData, error: cErr } = await ctx.supabase
      .from("libro_compras_cuotas")
      .select("nro, monto, pagado, compra_id, libro_compras!inner(moneda, estado)")
      .eq("empresa_id", emp)
      .in("compra_id", compraIds);
    if (cErr) throw new Error(cErr.message);
    const cuotas = (cuotasData ?? []) as unknown as Array<{
      nro: number;
      monto: number;
      pagado: number;
      compra_id: string;
      libro_compras: { moneda: string; estado: string };
    }>;
    const buscar = (p: ItemBody) => cuotas.find((c) => c.compra_id === p.compra_id && Number(c.nro) === p.cuota_nro);

    const aPagar: { compra_id: string; cuota_nro: number; monto: number }[] = [];
    const monedas = new Set<string>();
    for (const p of pedidos) {
      const c = buscar(p);
      if (!c) return NextResponse.json(errorResponse("Una de las cuotas ya no existe. Actualizá la pantalla."), { status: 409 });
      if (c.libro_compras.estado !== "registrada")
        return NextResponse.json(errorResponse("Una de las compras ya no está registrada."), { status: 409 });
      const saldo = Number(c.monto) - Number(c.pagado);
      if (saldo > 0.001) {
        aPagar.push({ compra_id: p.compra_id, cuota_nro: p.cuota_nro, monto: Number(saldo.toFixed(4)) });
        monedas.add(c.libro_compras.moneda);
      }
    }
    if (aPagar.length === 0) return NextResponse.json(errorResponse("Las cuotas elegidas ya están pagadas."), { status: 409 });
    if (monedas.size > 1)
      return NextResponse.json(errorResponse("Elegí cuotas de una sola moneda: una cuenta paga en una sola moneda."), { status: 400 });

    const moneda = [...monedas][0];
    const total = aPagar.reduce((s, x) => s + x.monto, 0);
    // Chequeo el total de una (la caja chica no puede quedar en negativo; el banco avisa).
    await validarMovimiento(ctx.supabase, emp, medio, String(b.cuenta_id), moneda, total);

    const avisos: string[] = [];
    let pagados = 0;
    for (const x of aPagar) {
      const r = await registrarPago(ctx.supabase, ctx.auth, {
        compraId: x.compra_id,
        cuotaNro: x.cuota_nro,
        fecha,
        monto: x.monto,
        medio,
        cuentaId: String(b.cuenta_id),
        referencia,
      });
      pagados += 1;
      if (r.aviso) avisos.push(r.aviso);
    }
    return NextResponse.json(successResponse({ pagados, total, moneda, avisos }));
  } catch (err) {
    if (err instanceof ErrorTesoreria) return NextResponse.json(errorResponse(err.message), { status: 400 });
    console.error("[/api/libro-compras/por-pagar/pagar-lote POST]", err);
    return NextResponse.json(errorResponse("No se pudo registrar el pago en bloque."), { status: 500 });
  }
}
