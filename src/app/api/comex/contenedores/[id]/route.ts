import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { diferencias, registrarHistorial } from "@/lib/comex/server";
import { ESTADO_CONTENEDOR_LABEL, transicionContenedorValida } from "@/lib/comex/estados";
import type { EstadoContenedor } from "@/lib/comex/types";

const COLS =
  "id, numero, tipo_operacion, importacion_id, exportacion_id, estado, naviera, fecha_prevista, fecha_real, observaciones";

/**
 * PATCH: datos del contenedor o cambio de estado (de a un paso, CON-02).
 * Cada cambio queda en el historial del contenedor y de su operación.
 */
export async function PATCH(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data } = await ctx.supabase.from("comex_contenedores").select(COLS).eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle();
    const antes = data as unknown as (Record<string, unknown> & { estado: EstadoContenedor; numero: string; importacion_id: string | null; exportacion_id: string | null }) | null;
    if (!antes) return NextResponse.json(errorResponse("Contenedor no encontrado."), { status: 404 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    for (const k of ["naviera", "fecha_prevista", "fecha_real", "observaciones"] as const) {
      if (b[k] !== undefined) update[k] = b[k] === "" ? null : b[k];
    }
    if (b.numero !== undefined) {
      const n = String(b.numero).trim().toUpperCase();
      if (!n) return NextResponse.json(errorResponse("El número no puede quedar vacío."), { status: 400 });
      update.numero = n.slice(0, 40);
    }
    if (b.estado !== undefined) {
      const hacia = String(b.estado) as EstadoContenedor;
      if (!(hacia in ESTADO_CONTENEDOR_LABEL)) return NextResponse.json(errorResponse("Estado inválido."), { status: 400 });
      if (hacia !== antes.estado) {
        if (!transicionContenedorValida(antes.estado, hacia))
          return NextResponse.json(
            errorResponse(`No se puede pasar de "${ESTADO_CONTENEDOR_LABEL[antes.estado]}" a "${ESTADO_CONTENEDOR_LABEL[hacia]}".`),
            { status: 400 }
          );
        update.estado = hacia;
      }
    }
    if (antes.estado === "cerrado" && Object.keys(update).length)
      return NextResponse.json(errorResponse("El contenedor está cerrado."), { status: 400 });

    const cambios = diferencias(antes, update);
    if (!Object.keys(cambios).length) return NextResponse.json(successResponse({ id }));
    const { error } = await ctx.supabase
      .from("comex_contenedores")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id);
    if (error) throw new Error(error.message);

    const accion = update.estado ? "CAMBIAR_ESTADO" : "MODIFICAR";
    await registrarHistorial(ctx.supabase, ctx.auth, "CONTENEDOR", id, accion, { cambios });
    const operacion = antes.importacion_id
      ? (["IMPORTACION", antes.importacion_id] as const)
      : antes.exportacion_id
        ? (["EXPORTACION", antes.exportacion_id] as const)
        : null;
    if (operacion)
      await registrarHistorial(ctx.supabase, ctx.auth, operacion[0], operacion[1], `CONTENEDOR_${accion}`, { contenedor: antes.numero, cambios });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/comex/contenedores/:id PATCH]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}

/** DELETE: solo si no tiene mercadería asignada y sigue en preparación. */
export async function DELETE(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const { data } = await ctx.supabase.from("comex_contenedores").select(COLS).eq("empresa_id", emp).eq("id", id).maybeSingle();
    const c = data as unknown as { estado: string; numero: string; importacion_id: string | null } | null;
    if (!c) return NextResponse.json(errorResponse("Contenedor no encontrado."), { status: 404 });
    const { count } = await ctx.supabase.from("importacion_items").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("contenedor_id", id);
    if (c.estado !== "en_preparacion" || (count ?? 0) > 0)
      return NextResponse.json(errorResponse("Solo se quita un contenedor en preparación y sin mercadería asignada."), { status: 400 });
    const { error } = await ctx.supabase.from("comex_contenedores").delete().eq("empresa_id", emp).eq("id", id);
    if (error) throw new Error(error.message);
    if (c.importacion_id) await registrarHistorial(ctx.supabase, ctx.auth, "IMPORTACION", c.importacion_id, "QUITAR_CONTENEDOR", { contenedor: c.numero });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/comex/contenedores/:id DELETE]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
