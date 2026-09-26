import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { diferencias, nombreUsuario, registrarHistorial } from "@/lib/comex/server";
import { ESTADO_INCIDENCIA_LABEL, FLUJO_INCIDENCIA } from "@/lib/comex/estados";
import type { EstadoIncidencia, OrigenComex } from "@/lib/comex/types";

const COLS = "id, origen_tipo, origen_id, estado, descripcion, prioridad, responsable_id, responsable_nombre, accion_correctiva";

/**
 * PATCH { estado?, responsable_id?, responsable_nombre?, accion_correctiva?, prioridad? }
 * Estados: Detectada → Asignada → En proceso → Resuelta → Verificada (QA-04).
 * Resolver pide la acción correctiva; verificar lo hace otra persona.
 */
export async function PATCH(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data } = await ctx.supabase.from("comex_incidencias").select(COLS).eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle();
    const antes = data as unknown as (Record<string, unknown> & { estado: EstadoIncidencia; origen_tipo: OrigenComex; origen_id: string; accion_correctiva: string | null; descripcion: string }) | null;
    if (!antes) return NextResponse.json(errorResponse("Incidencia no encontrada."), { status: 404 });
    if (antes.estado === "verificado") return NextResponse.json(errorResponse("La incidencia ya está verificada y cerrada."), { status: 400 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (b.responsable_nombre !== undefined) {
      update.responsable_nombre = b.responsable_nombre ? String(b.responsable_nombre).trim() : null;
      update.responsable_id = b.responsable_id ? String(b.responsable_id) : null;
    }
    if (b.accion_correctiva !== undefined) update.accion_correctiva = b.accion_correctiva ? String(b.accion_correctiva).slice(0, 2000) : null;
    if (b.prioridad !== undefined && ["baja", "media", "alta"].includes(String(b.prioridad))) update.prioridad = String(b.prioridad);

    if (b.estado !== undefined && b.estado !== antes.estado) {
      const hacia = String(b.estado) as EstadoIncidencia;
      const a = FLUJO_INCIDENCIA.indexOf(antes.estado);
      const h = FLUJO_INCIDENCIA.indexOf(hacia);
      if (h < 0) return NextResponse.json(errorResponse("Estado inválido."), { status: 400 });
      // Avanza de a un paso; puede volver a "En proceso" si al verificar no estaba bien.
      const vuelveAProceso = antes.estado === "resuelto" && hacia === "en_proceso";
      if (h !== a + 1 && !vuelveAProceso)
        return NextResponse.json(
          errorResponse(`No se puede pasar de "${ESTADO_INCIDENCIA_LABEL[antes.estado]}" a "${ESTADO_INCIDENCIA_LABEL[hacia]}".`),
          { status: 400 }
        );
      const responsable = (update.responsable_nombre ?? antes.responsable_nombre) as string | null;
      if (h >= FLUJO_INCIDENCIA.indexOf("asignado") && !responsable)
        return NextResponse.json(errorResponse("Asigná un responsable primero."), { status: 400 });
      if (hacia === "resuelto" && !String(update.accion_correctiva ?? antes.accion_correctiva ?? "").trim())
        return NextResponse.json(errorResponse("Para resolverla, escribí qué se hizo (acción correctiva)."), { status: 400 });
      update.estado = hacia;
      if (hacia === "resuelto") update.resuelto_at = new Date().toISOString();
      if (hacia === "verificado") {
        update.verificado_at = new Date().toISOString();
        update.verificado_por_nombre = nombreUsuario(ctx.auth);
      }
    }
    // Asignar un responsable a una detectada la pasa a asignada.
    if (!update.estado && antes.estado === "detectado" && update.responsable_nombre) update.estado = "asignado";

    const cambios = diferencias(antes, update);
    if (!Object.keys(cambios).length) return NextResponse.json(successResponse({ id }));
    const { error } = await ctx.supabase
      .from("comex_incidencias")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id);
    if (error) throw new Error(error.message);
    await registrarHistorial(ctx.supabase, ctx.auth, antes.origen_tipo, antes.origen_id, "MODIFICAR_INCIDENCIA", {
      incidencia: antes.descripcion.slice(0, 120),
      cambios,
    });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/comex/incidencias/:id PATCH]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
