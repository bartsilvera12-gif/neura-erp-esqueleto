import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, hoyPY, nombreUsuario } from "@/lib/comex/server";
import { signoBanco } from "@/lib/tesoreria/server";

type Params = { params: Promise<{ id: string }> };

/** GET — movimientos de la cuenta con saldo corrido (del más viejo al más nuevo). */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const [cta, movs] = await Promise.all([
      ctx.supabase.from("entidades_bancarias").select("id, nombre, numero_cuenta, moneda, titular, saldo_inicial, fecha_saldo_inicial, cuenta_contable_codigo, activo").eq("empresa_id", emp).eq("id", id).maybeSingle(),
      ctx.supabase
        .from("banco_movimientos")
        .select("id, tipo, monto, moneda, fecha, referencia, observacion, compra_id, transferencia_grupo, usuario_nombre, created_at")
        .eq("empresa_id", emp)
        .eq("entidad_bancaria_id", id)
        .order("fecha")
        .order("created_at"),
    ]);
    const err = cta.error ?? movs.error;
    if (err) throw new Error(err.message);
    if (!cta.data) return NextResponse.json(errorResponse("La cuenta no existe."), { status: 404 });
    let saldo = Number((cta.data as { saldo_inicial: number }).saldo_inicial) || 0;
    const lista = ((movs.data ?? []) as { tipo: string; monto: number }[]).map((m) => {
      saldo += signoBanco(m.tipo, Number(m.monto));
      return { ...m, saldo };
    });
    return NextResponse.json(successResponse({ cuenta: cta.data, movimientos: lista.reverse(), saldo }));
  } catch (err) {
    console.error("[/api/tesoreria/bancos/:id/movimientos GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar los movimientos."), { status: 500 });
  }
}

/** POST { tipo: deposito|retiro, monto, fecha, referencia, observacion } — movimiento manual. */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const tipo = b.tipo === "retiro" ? "retiro" : b.tipo === "deposito" ? "deposito" : null;
    const monto = Number(b.monto);
    const concepto = String(b.observacion ?? "").trim();
    if (!tipo) return NextResponse.json(errorResponse("Elegí si es ingreso o egreso."), { status: 400 });
    if (!(monto > 0)) return NextResponse.json(errorResponse("El monto tiene que ser mayor a 0."), { status: 400 });
    if (!concepto) return NextResponse.json(errorResponse("Escribí el concepto."), { status: 400 });
    const { data: cta } = await ctx.supabase.from("entidades_bancarias").select("moneda, tipo, activo").eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle();
    const c0 = cta as { moneda: string | null; tipo: string; activo: boolean } | null;
    if (!c0 || c0.tipo !== "banco") return NextResponse.json(errorResponse("La cuenta no existe."), { status: 404 });
    if (c0.activo === false) return NextResponse.json(errorResponse("La cuenta está inactiva."), { status: 400 });
    const { error } = await ctx.supabase.from("banco_movimientos").insert({
      empresa_id: ctx.auth.empresa_id,
      entidad_bancaria_id: id,
      tipo,
      monto,
      moneda: (cta as { moneda: string | null }).moneda ?? "PYG",
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha ?? "")) ? b.fecha : hoyPY(),
      referencia: b.referencia ? String(b.referencia).trim().slice(0, 60) : null,
      observacion: concepto.slice(0, 300),
      created_by_user_id: ctx.auth.usuarioCatalogId ?? null,
      usuario_nombre: nombreUsuario(ctx.auth),
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    console.error("[/api/tesoreria/bancos/:id/movimientos POST]", err);
    return NextResponse.json(errorResponse("No se pudo registrar el movimiento."), { status: 500 });
  }
}
