import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, estadoOperacion, operacionCerrada, registrarHistorial } from "@/lib/comex/server";

const COLS = "id, origen_tipo, origen_id, tipo, monto, moneda, pagado";

type Gasto = { origen_tipo: "IMPORTACION" | "EXPORTACION"; origen_id: string; tipo: string; monto: number; moneda: string; pagado: boolean };

type ComexCtx = NonNullable<Awaited<ReturnType<typeof getComexCtx>>>;
type Editable = { ok: true; ctx: ComexCtx; gasto: Gasto } | { ok: false; status: number; error: string };

/** El gasto, si es de la empresa y su operación sigue abierta. */
async function gastoEditable(request: NextRequest, id: string): Promise<Editable> {
  const ctx = await getComexCtx(request);
  if (!ctx) return { ok: false, status: 401, error: API_ERRORS.UNAUTHORIZED };
  const { data } = await ctx.supabase.from("comex_gastos").select(COLS).eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle();
  const gasto = data as unknown as Gasto | null;
  if (!gasto) return { ok: false, status: 404, error: "Gasto no encontrado." };
  const estado = await estadoOperacion(ctx.supabase, ctx.auth.empresa_id, gasto.origen_tipo, gasto.origen_id);
  if (!estado || operacionCerrada(estado)) return { ok: false, status: 400, error: "La operación está cerrada o anulada." };
  return { ok: true, ctx, gasto };
}

/** PATCH { pagado } — marcar el gasto como pagado o pendiente. */
export async function PATCH(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const r = await gastoEditable(request, id);
    if (!r.ok) return NextResponse.json(errorResponse(r.error), { status: r.status });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof b.pagado !== "boolean") return NextResponse.json(errorResponse("Nada que cambiar."), { status: 400 });
    const { error } = await r.ctx.supabase
      .from("comex_gastos")
      .update({ pagado: b.pagado, updated_at: new Date().toISOString() })
      .eq("empresa_id", r.ctx.auth.empresa_id)
      .eq("id", id);
    if (error) throw new Error(error.message);
    await registrarHistorial(r.ctx.supabase, r.ctx.auth, r.gasto.origen_tipo, r.gasto.origen_id, "GASTO_PAGADO", {
      tipo: r.gasto.tipo,
      monto: r.gasto.monto,
      pagado: b.pagado,
    });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/comex/gastos/:id PATCH]", err);
    return NextResponse.json(errorResponse("No se pudo actualizar el gasto."), { status: 500 });
  }
}

/** DELETE — quita el gasto (queda en el historial de la operación). */
export async function DELETE(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const r = await gastoEditable(request, id);
    if (!r.ok) return NextResponse.json(errorResponse(r.error), { status: r.status });
    const { error } = await r.ctx.supabase.from("comex_gastos").delete().eq("empresa_id", r.ctx.auth.empresa_id).eq("id", id);
    if (error) throw new Error(error.message);
    await registrarHistorial(r.ctx.supabase, r.ctx.auth, r.gasto.origen_tipo, r.gasto.origen_id, "QUITAR_GASTO", {
      tipo: r.gasto.tipo,
      monto: r.gasto.monto,
      moneda: r.gasto.moneda,
    });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/comex/gastos/:id DELETE]", err);
    return NextResponse.json(errorResponse("No se pudo quitar el gasto."), { status: 500 });
  }
}
