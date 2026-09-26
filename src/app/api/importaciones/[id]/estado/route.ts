import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { registrarHistorial } from "@/lib/comex/server";
import { ESTADO_IMPORTACION_LABEL, FLUJO_IMPORTACION, transicionImportacionValida } from "@/lib/comex/estados";
import { faltantesParaEstado } from "@/lib/importaciones/validar";
import type { EstadoImportacion } from "@/lib/importaciones/types";

/**
 * POST { estado, motivo? } — cambia el estado de a un paso (CON-02).
 * Avanzar exige lo que pide faltantesParaEstado; anular exige motivo y admin.
 */
export async function POST(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as { estado?: string; motivo?: string };
    const hacia = String(b.estado ?? "") as EstadoImportacion;
    if (!(hacia in ESTADO_IMPORTACION_LABEL)) return NextResponse.json(errorResponse("Estado inválido."), { status: 400 });

    const { data } = await ctx.supabase
      .from("importaciones")
      .select("id, estado, proveedor_nombre, pais_origen, responsable_nombre, fecha_embarque, fecha_arribo, fecha_nacionalizacion")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (!data) return NextResponse.json(errorResponse("Importación no encontrada."), { status: 404 });
    const imp = data as Parameters<typeof faltantesParaEstado>[2] & { estado: EstadoImportacion };

    if (!transicionImportacionValida(imp.estado, hacia))
      return NextResponse.json(
        errorResponse(`No se puede pasar de "${ESTADO_IMPORTACION_LABEL[imp.estado]}" a "${ESTADO_IMPORTACION_LABEL[hacia]}".`),
        { status: 400 }
      );

    const motivo = String(b.motivo ?? "").trim();
    if (hacia === "anulada") {
      if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede anular."), { status: 403 });
      if (!motivo) return NextResponse.json(errorResponse("Escribí el motivo de la anulación."), { status: 400 });
    }

    const avanza = FLUJO_IMPORTACION.indexOf(hacia) > FLUJO_IMPORTACION.indexOf(imp.estado);
    if (avanza) {
      const faltan = await faltantesParaEstado(ctx.supabase, ctx.auth.empresa_id, imp, hacia);
      if (faltan.length) return NextResponse.json({ ...errorResponse(faltan.join(" ")), faltantes: faltan }, { status: 400 });
    } else if (hacia !== "anulada" && !motivo) {
      return NextResponse.json(errorResponse("Para volver un paso atrás, escribí el motivo."), { status: 400 });
    }

    const { error } = await ctx.supabase
      .from("importaciones")
      .update({ estado: hacia, updated_at: new Date().toISOString(), ...(hacia === "anulada" ? { anulada_motivo: motivo } : {}) })
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id);
    if (error) throw new Error(error.message);
    await registrarHistorial(ctx.supabase, ctx.auth, "IMPORTACION", id, hacia === "anulada" ? "ANULAR" : "CAMBIAR_ESTADO", {
      antes: imp.estado,
      despues: hacia,
      ...(motivo ? { motivo } : {}),
    });
    return NextResponse.json(successResponse({ id, estado: hacia }));
  } catch (err) {
    console.error("[/api/importaciones/:id/estado POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
