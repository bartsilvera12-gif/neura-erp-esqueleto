import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { getComexCtx, registrarHistorial } from "@/lib/comex/server";
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
    const ctx = await getComexCtx(request);
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
    } else if (hacia !== "anulada") {
      if (!motivo) return NextResponse.json(errorResponse("Para volver un paso atrás, escribí el motivo."), { status: 400 });
      // Con mercadería ya recibida no se vuelve antes de Arribado: lo pedido quedaría editable.
      if (FLUJO_IMPORTACION.indexOf(hacia) < FLUJO_IMPORTACION.indexOf("arribado")) {
        const { count } = await ctx.supabase
          .from("importacion_recepciones")
          .select("id", { count: "exact", head: true })
          .eq("empresa_id", ctx.auth.empresa_id)
          .eq("importacion_id", id);
        if ((count ?? 0) > 0)
          return NextResponse.json(errorResponse("Ya hay mercadería recibida: no se puede volver a un estado anterior a Arribado."), { status: 400 });
      }
    }

    const { data: upd, error } = await ctx.supabase
      .from("importaciones")
      .update({ estado: hacia, updated_at: new Date().toISOString(), ...(hacia === "anulada" ? { anulada_motivo: motivo } : {}) })
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id)
      .eq("estado", imp.estado) // si otro lo cambió recién, no se pisa
      .select("id");
    if (error) throw new Error(error.message);
    if (!(upd ?? []).length) return NextResponse.json(errorResponse("La importación cambió mientras tanto. Actualizá la página."), { status: 409 });
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
