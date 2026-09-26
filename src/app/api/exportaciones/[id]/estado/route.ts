import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { getComexCtx, esResponsable, nombreUsuario, registrarHistorial } from "@/lib/comex/server";
import { ESTADO_EXPORTACION_LABEL, FLUJO_EXPORTACION, transicionExportacionValida } from "@/lib/comex/estados";
import { faltantesExportacion } from "@/lib/exportaciones/validar";
import { EXPORTACION_COLS, type EstadoExportacion } from "@/lib/exportaciones/types";

/**
 * POST { estado, motivo? } — de a un paso. Aprobar el despacho exige checklist
 * completo, factura y proforma (QA-01, EXP-02/03). Anular: admin con motivo.
 */
export async function POST(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as { estado?: string; motivo?: string };
    const hacia = String(b.estado ?? "") as EstadoExportacion;
    if (!(hacia in ESTADO_EXPORTACION_LABEL)) return NextResponse.json(errorResponse("Estado inválido."), { status: 400 });

    const { data } = await ctx.supabase.from("exportaciones").select(EXPORTACION_COLS).eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle();
    if (!data) return NextResponse.json(errorResponse("Exportación no encontrada."), { status: 404 });
    const exp = data as unknown as Parameters<typeof faltantesExportacion>[2] & { estado: EstadoExportacion; responsable_id: string | null; numero: string };

    if (!transicionExportacionValida(exp.estado, hacia))
      return NextResponse.json(
        errorResponse(`No se puede pasar de "${ESTADO_EXPORTACION_LABEL[exp.estado]}" a "${ESTADO_EXPORTACION_LABEL[hacia]}".`),
        { status: 400 }
      );
    const esAdmin = esRolAdminEmpresaOGlobal(ctx.auth.rol);
    const motivo = String(b.motivo ?? "").trim();
    if (hacia === "anulada") {
      if (!esAdmin) return NextResponse.json(errorResponse("Solo un administrador puede anular."), { status: 403 });
      if (!motivo) return NextResponse.json(errorResponse("Escribí el motivo de la anulación."), { status: 400 });
    }
    // Aprobar el despacho: el responsable del envío o un administrador.
    if (hacia === "aprobada" && FLUJO_EXPORTACION.indexOf(exp.estado) < FLUJO_EXPORTACION.indexOf("aprobada") && !esAdmin && !esResponsable(ctx.auth, exp.responsable_id))
      return NextResponse.json(errorResponse("El despacho lo aprueba el responsable del envío o un administrador."), { status: 403 });

    const avanza = FLUJO_EXPORTACION.indexOf(hacia) > FLUJO_EXPORTACION.indexOf(exp.estado);
    if (avanza) {
      const faltan = await faltantesExportacion(ctx.supabase, ctx.auth.empresa_id, exp, hacia);
      if (faltan.length) return NextResponse.json({ ...errorResponse(faltan.join(" ")), faltantes: faltan }, { status: 400 });
    } else if (hacia !== "anulada" && !motivo) {
      return NextResponse.json(errorResponse("Para volver un paso atrás, escribí el motivo."), { status: 400 });
    }

    const extra: Record<string, unknown> = {};
    // Anular libera la factura y la nota de remisión para poder usarlas en otro envío.
    if (hacia === "anulada") Object.assign(extra, { anulada_motivo: motivo, factura_id: null, nota_remision_id: null });
    if (hacia === "aprobada") {
      extra.aprobada_por_nombre = nombreUsuario(ctx.auth);
      extra.aprobada_at = new Date().toISOString();
    }
    // Si se vuelve atrás desde aprobada, la aprobación deja de valer.
    if (exp.estado === "aprobada" && hacia === "documentacion") {
      extra.aprobada_por_nombre = null;
      extra.aprobada_at = null;
    }
    const { data: upd, error } = await ctx.supabase
      .from("exportaciones")
      .update({ estado: hacia, updated_at: new Date().toISOString(), ...extra })
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id)
      .eq("estado", exp.estado) // si otro lo cambió recién, no se pisa
      .select("id");
    if (error) throw new Error(error.message);
    if (!(upd ?? []).length) return NextResponse.json(errorResponse("La exportación cambió mientras tanto. Actualizá la página."), { status: 409 });

    // Al volver atrás, los controles hechos dejan de valer: hay que revisar de nuevo.
    const reset = exp.estado === "aprobada" && hacia === "documentacion" ? ["aprobacion_responsable"] : hacia === "preparacion" ? null : undefined;
    if (reset !== undefined) {
      let q = ctx.supabase
        .from("exportacion_checklist")
        .update({ ok: false, usuario_id: ctx.auth.usuarioCatalogId ?? null, usuario_nombre: nombreUsuario(ctx.auth), updated_at: new Date().toISOString() })
        .eq("empresa_id", ctx.auth.empresa_id)
        .eq("exportacion_id", id)
        .eq("ok", true);
      if (reset) q = q.in("item", reset);
      await q;
    }
    await registrarHistorial(ctx.supabase, ctx.auth, "EXPORTACION", id, hacia === "anulada" ? "ANULAR" : hacia === "aprobada" ? "APROBAR_DESPACHO" : "CAMBIAR_ESTADO", {
      antes: exp.estado,
      despues: hacia,
      ...(motivo ? { motivo } : {}),
      ...(hacia === "anulada" && (exp.factura_id || exp.nota_remision_id) ? { detalle: ["Se liberaron la factura y la nota de remisión vinculadas."] } : {}),
      ...(exp.estado === "aprobada" && hacia === "documentacion" ? { detalle: ["La aprobación del responsable se desmarcó: hay que volver a aprobar."] } : {}),
      ...(hacia === "preparacion" ? { detalle: ["Los controles de despacho se desmarcaron: hay que revisarlos de nuevo."] } : {}),
    });
    return NextResponse.json(successResponse({ id, estado: hacia }));
  } catch (err) {
    console.error("[/api/exportaciones/:id/estado POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
