import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { diferencias, esUuid, getComexCtx, registrarHistorial } from "@/lib/comex/server";

/**
 * PATCH — datos del compromiso o su cierre:
 * estado "cumplido" pide la fecha real de entrega; "cancelado" pide motivo (en observaciones).
 */
export async function PATCH(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data } = await ctx.supabase.from("proveedor_compromisos").select("*").eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle();
    const antes = data as Record<string, unknown> | null;
    if (!antes) return NextResponse.json(errorResponse("El compromiso no existe."), { status: 404 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const upd: Record<string, unknown> = {};
    for (const k of ["productos", "documentacion_requerida", "observaciones", "responsable_nombre", "proveedor_nombre"]) if (b[k] !== undefined) upd[k] = String(b[k] ?? "").trim() || null;
    for (const k of ["fecha_comprometida", "fecha_real"]) if (b[k] !== undefined) upd[k] = /^\d{4}-\d{2}-\d{2}$/.test(String(b[k] ?? "")) ? b[k] : null;
    if (b.cantidad !== undefined) upd.cantidad = b.cantidad === "" || b.cantidad == null ? null : Number(b.cantidad);
    if (b.documentacion_completa !== undefined) upd.documentacion_completa = b.documentacion_completa === true;
    if (b.responsable_id !== undefined) upd.responsable_id = esUuid(b.responsable_id) ? b.responsable_id : null;
    if (b.estado !== undefined) {
      const e = String(b.estado);
      if (!["pendiente", "cumplido", "cancelado"].includes(e)) return NextResponse.json(errorResponse("Estado inválido."), { status: 400 });
      if (e === "cumplido" && !(upd.fecha_real ?? antes.fecha_real)) return NextResponse.json(errorResponse("Para marcarlo cumplido, cargá la fecha real de entrega."), { status: 400 });
      if (e === "cancelado" && !String(upd.observaciones ?? antes.observaciones ?? "").trim()) return NextResponse.json(errorResponse("Para cancelarlo, explicá el motivo en observaciones."), { status: 400 });
      upd.estado = e;
    }
    if ("productos" in upd && !upd.productos) return NextResponse.json(errorResponse("No puede quedar vacío qué se comprometió."), { status: 400 });
    if ("fecha_comprometida" in upd && !upd.fecha_comprometida) return NextResponse.json(errorResponse("Falta la fecha comprometida."), { status: 400 });
    const cambios = diferencias(antes, upd);
    if (!Object.keys(cambios).length) return NextResponse.json(successResponse({ id }));
    const { error } = await ctx.supabase.from("proveedor_compromisos").update({ ...upd, updated_at: new Date().toISOString() }).eq("empresa_id", ctx.auth.empresa_id).eq("id", id);
    if (error) throw new Error(error.message);
    await registrarHistorial(ctx.supabase, ctx.auth, "COMPROMISO", id, upd.estado ? "CAMBIAR_ESTADO" : "MODIFICAR", { cambios });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/comex/compromisos/:id PATCH]", err);
    return NextResponse.json(errorResponse("No se pudo guardar."), { status: 500 });
  }
}
