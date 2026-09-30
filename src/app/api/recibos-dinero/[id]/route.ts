import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";

const METODOS = new Set(["efectivo", "transferencia", "tarjeta", "cheque", "otro"]);
const txt = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;

/**
 * PATCH /api/recibos-dinero/[id] — corrige un recibo (solo admin).
 * Siempre: cliente, documento, concepto, método, referencia y observaciones.
 * Monto y moneda solo en los recibos manuales: en los que vienen de una venta o
 * de un cobro el monto es el de esa operación.
 */
export async function PATCH(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede editar recibos."), { status: 403 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const rq = await ctx.supabase.from("recibos_dinero").select("id, origen, anulado").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (rq.error) throw new Error(rq.error.message);
    const r = rq.data as { id: string; origen: string; anulado: boolean } | null;
    if (!r) return NextResponse.json(errorResponse("El recibo no existe."), { status: 404 });
    if (r.anulado) return NextResponse.json(errorResponse("Un recibo anulado no se puede editar."), { status: 400 });

    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.cliente_nombre !== undefined) {
      const n = txt(b.cliente_nombre, 200);
      if (!n) return NextResponse.json(errorResponse("Falta el nombre del cliente."), { status: 400 });
      upd.cliente_nombre = n;
    }
    if (b.cliente_documento !== undefined) upd.cliente_documento = txt(b.cliente_documento, 30);
    if (b.concepto !== undefined) upd.concepto = txt(b.concepto, 300);
    if (b.referencia !== undefined) upd.referencia = txt(b.referencia, 80);
    if (b.observaciones !== undefined) upd.observaciones = txt(b.observaciones, 500);
    if (b.metodo_pago !== undefined) {
      if (!METODOS.has(String(b.metodo_pago))) return NextResponse.json(errorResponse("Método de pago inválido."), { status: 400 });
      upd.metodo_pago = String(b.metodo_pago);
    }
    if (r.origen === "manual") {
      if (b.monto !== undefined) {
        const m = Number(b.monto);
        if (!(m > 0)) return NextResponse.json(errorResponse("El monto tiene que ser mayor a 0."), { status: 400 });
        upd.monto = m;
      }
      if (b.moneda !== undefined) upd.moneda = b.moneda === "USD" ? "USD" : "PYG";
    }
    const { error } = await ctx.supabase.from("recibos_dinero").update(upd).eq("empresa_id", emp).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/recibos-dinero/[id] PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo guardar el recibo."), { status: 500 });
  }
}

/**
 * DELETE /api/recibos-dinero/[id] — borra un recibo hecho por error (solo admin).
 * No toca la venta ni el cobro: el recibo es un comprobante interno NO fiscal.
 */
export async function DELETE(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede borrar recibos."), { status: 403 });
    const { data, error } = await ctx.supabase.from("recibos_dinero").delete().eq("empresa_id", ctx.auth.empresa_id).eq("id", id).select("id");
    if (error) throw new Error(error.message);
    if (!(data ?? []).length) return NextResponse.json(errorResponse("El recibo no existe."), { status: 404 });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/recibos-dinero/[id] DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo borrar el recibo."), { status: 500 });
  }
}
