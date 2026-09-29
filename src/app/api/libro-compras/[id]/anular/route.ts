import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { getComexCtx, registrarHistorial } from "@/lib/comex/server";
import { anularPago, pagosVigentes } from "@/lib/tesoreria/server";

/** POST { motivo } — anula el comprobante (queda registrado, no se borra). Solo admin. */
export async function POST(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede anular."), { status: 403 });
    const b = (await request.json().catch(() => ({}))) as { motivo?: string };
    const motivo = String(b.motivo ?? "").trim();
    if (!motivo) return NextResponse.json(errorResponse("Escribí el motivo de la anulación."), { status: 400 });
    const { data: actual } = await ctx.supabase.from("libro_compras").select("estado").eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle();
    if ((actual as { estado: string } | null)?.estado !== "registrada") return NextResponse.json(errorResponse("El comprobante ya está anulado o no existe."), { status: 400 });
    // Primero se anulan los pagos (la plata vuelve al banco / caja chica); si algo falla, el comprobante sigue vigente y se puede reintentar.
    for (const pg of await pagosVigentes(ctx.supabase, ctx.auth.empresa_id, id)) await anularPago(ctx.supabase, ctx.auth, pg.id, `Comprobante anulado: ${motivo}`, id);
    const { data, error } = await ctx.supabase
      .from("libro_compras")
      .update({ estado: "anulada", anulada_motivo: motivo.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id)
      .eq("estado", "registrada")
      .select("id");
    if (error) throw new Error(error.message);
    if (!(data ?? []).length) return NextResponse.json(errorResponse("El comprobante ya está anulado o no existe."), { status: 400 });
    await registrarHistorial(ctx.supabase, ctx.auth, "COMPRA", id, "ANULAR", { motivo });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/libro-compras/:id/anular]", err);
    return NextResponse.json(errorResponse("No se pudo anular."), { status: 500 });
  }
}
