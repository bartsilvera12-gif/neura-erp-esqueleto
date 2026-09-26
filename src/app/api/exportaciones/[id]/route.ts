import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { getComexCtx, esResponsable, esUuid, diferencias, registrarHistorial } from "@/lib/comex/server";
import { FLUJO_EXPORTACION, siguienteExportacion } from "@/lib/comex/estados";
import { faltantesExportacion } from "@/lib/exportaciones/validar";
import { EXPORTACION_COLS, type EstadoExportacion } from "@/lib/exportaciones/types";

type Params = { params: Promise<{ id: string }> };

/** GET: la exportación, lo que falta para el siguiente paso y su factura y nota de remisión. */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const { data, error } = await ctx.supabase.from("exportaciones").select(EXPORTACION_COLS).eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json(errorResponse("Exportación no encontrada."), { status: 404 });
    const exp = data as unknown as Parameters<typeof faltantesExportacion>[2] & { estado: EstadoExportacion };
    const siguiente = siguienteExportacion(exp.estado);
    const [faltantes, factura, remision] = await Promise.all([
      siguiente && exp.estado !== "anulada" ? faltantesExportacion(ctx.supabase, emp, exp, siguiente) : Promise.resolve([]),
      exp.factura_id
        ? ctx.supabase
            .from("facturas_exportacion")
            .select("id, numero_formateado, fecha, cliente_nombre, moneda, total, estado, prueba")
            .eq("empresa_id", emp)
            .eq("id", exp.factura_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      exp.nota_remision_id
        ? ctx.supabase.from("notas_remision").select("id, numero, fecha, destino_nombre, estado").eq("empresa_id", emp).eq("id", exp.nota_remision_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return NextResponse.json(successResponse({ exportacion: data, siguiente, faltantes, factura: factura.data, remision: remision.data }));
  } catch (err) {
    console.error("[/api/exportaciones/:id GET]", err);
    return NextResponse.json(errorResponse("No se pudo cargar la exportación."), { status: 500 });
  }
}

/**
 * PATCH: datos del envío, vínculo con factura / nota de remisión y la regla
 * de proforma (solo admin, con motivo). El estado va por /estado.
 */
export async function PATCH(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const prev = await ctx.supabase.from("exportaciones").select(EXPORTACION_COLS).eq("empresa_id", emp).eq("id", id).maybeSingle();
    const antes = prev.data as unknown as (Record<string, unknown> & { estado: string; requiere_proforma: boolean; responsable_id: string | null }) | null;
    if (!antes) return NextResponse.json(errorResponse("Exportación no encontrada."), { status: 404 });
    if (antes.estado === "anulada" || antes.estado === "cerrada")
      return NextResponse.json(errorResponse("La exportación está cerrada o anulada; no se puede modificar."), { status: 400 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    for (const k of [
      "cliente_id",
      "cliente_nombre",
      "pais_destino",
      "productor",
      "responsable_id",
      "responsable_nombre",
      "fecha_comprometida_embarque",
      "fecha_comprometida_entrega",
      "fecha_embarque",
      "fecha_entrega",
      "observaciones",
    ] as const) {
      if (b[k] !== undefined) update[k] = b[k] === "" ? null : b[k];
    }
    for (const [k, label] of [["cliente_nombre", "el cliente"], ["pais_destino", "el país de destino"], ["responsable_nombre", "el responsable"]] as const) {
      if (k in update && !String(update[k] ?? "").trim())
        return NextResponse.json(errorResponse(`No se puede dejar vacío ${label}.`), { status: 400 });
    }
    if ("cliente_id" in update && update.cliente_id !== null && !esUuid(update.cliente_id)) update.cliente_id = null;
    if ("responsable_id" in update && update.responsable_id !== null && !esUuid(update.responsable_id))
      return NextResponse.json(errorResponse("Responsable inválido."), { status: 400 });

    const armando = antes.estado === "preparacion" || antes.estado === "documentacion";
    // Las fechas que exigió el estado actual no se pueden borrar.
    const idxEstado = FLUJO_EXPORTACION.indexOf(antes.estado as EstadoExportacion);
    for (const [k, desde, label] of [
      ["fecha_comprometida_embarque", "documentacion", "embarque comprometido"],
      ["fecha_embarque", "despachada", "embarque"],
      ["fecha_entrega", "entregada", "entrega"],
    ] as const) {
      if (k in update && !update[k] && idxEstado >= FLUJO_EXPORTACION.indexOf(desde))
        return NextResponse.json(errorResponse(`La fecha de ${label} no se puede borrar en este estado.`), { status: 400 });
    }
    const esAdmin = esRolAdminEmpresaOGlobal(ctx.auth.rol);
    // Cliente, destino y responsable quedan fijos cuando el despacho ya se aprobó.
    const cambiaDatosEnvio = ["cliente_id", "cliente_nombre", "pais_destino", "responsable_id", "responsable_nombre"].some(
      (k) => k in update && String(update[k] ?? "") !== String(antes[k] ?? "")
    );
    if (cambiaDatosEnvio && !armando)
      return NextResponse.json(errorResponse("Cliente, destino y responsable no se cambian después de aprobar el despacho."), { status: 400 });
    // El responsable lo cambia un administrador o el responsable actual.
    if (String(update.responsable_id ?? antes.responsable_id ?? "") !== String(antes.responsable_id ?? "") && "responsable_id" in update && !esAdmin && !esResponsable(ctx.auth, antes.responsable_id))
      return NextResponse.json(errorResponse("El responsable lo cambia un administrador o el responsable actual."), { status: 403 });

    // Regla de proforma: configurable por operación, solo admin y con motivo.
    if (b.requiere_proforma !== undefined && Boolean(b.requiere_proforma) !== antes.requiere_proforma) {
      if (!armando) return NextResponse.json(errorResponse("Lo de la proforma se define antes de aprobar el despacho."), { status: 400 });
      if (!esAdmin)
        return NextResponse.json(errorResponse("Solo un administrador puede cambiar si lleva proforma."), { status: 403 });
      const motivo = String(b.motivo_sin_proforma ?? "").trim();
      if (!b.requiere_proforma && !motivo)
        return NextResponse.json(errorResponse("Indicá por qué no lleva proforma (por ejemplo: contenedor Sarasota)."), { status: 400 });
      update.requiere_proforma = Boolean(b.requiere_proforma);
      update.motivo_sin_proforma = b.requiere_proforma ? null : motivo.slice(0, 300);
    }

    // Factura: de exportación, emitida (o de prueba), y no vinculada a otro envío.
    if (b.factura_id !== undefined && String(b.factura_id || "") !== String(antes.factura_id ?? "")) {
      if (!armando) return NextResponse.json(errorResponse("La factura se cambia antes de aprobar el despacho."), { status: 400 });
      const fid = b.factura_id ? String(b.factura_id) : null;
      if (fid && !esUuid(fid)) return NextResponse.json(errorResponse("Factura inválida."), { status: 400 });
      if (fid) {
        const { data: f } = await ctx.supabase.from("facturas_exportacion").select("tipo, estado, numero_formateado").eq("empresa_id", emp).eq("id", fid).maybeSingle();
        const fac = f as { tipo: string; estado: string; numero_formateado: string | null } | null;
        if (!fac) return NextResponse.json(errorResponse("La factura no existe."), { status: 400 });
        if (fac.tipo !== "EXPORTACION") return NextResponse.json(errorResponse("Tiene que ser una factura de exportación."), { status: 400 });
        if (fac.estado !== "EMITIDA") return NextResponse.json(errorResponse("La factura tiene que estar emitida."), { status: 400 });
        const { data: otra } = await ctx.supabase.from("exportaciones").select("numero").eq("empresa_id", emp).eq("factura_id", fid).neq("id", id).maybeSingle();
        if (otra) return NextResponse.json(errorResponse(`Esa factura ya está vinculada a ${(otra as { numero: string }).numero}.`), { status: 400 });
      }
      update.factura_id = fid;
    }
    if (b.nota_remision_id !== undefined && String(b.nota_remision_id || "") !== String(antes.nota_remision_id ?? "")) {
      if (!armando && antes.estado !== "aprobada")
        return NextResponse.json(errorResponse("La nota de remisión se cambia antes de despachar."), { status: 400 });
      const nid = b.nota_remision_id ? String(b.nota_remision_id) : null;
      if (nid && !esUuid(nid)) return NextResponse.json(errorResponse("Nota de remisión inválida."), { status: 400 });
      if (nid) {
        const { data: n } = await ctx.supabase.from("notas_remision").select("estado").eq("empresa_id", emp).eq("id", nid).maybeSingle();
        const nr = n as { estado: string } | null;
        if (!nr) return NextResponse.json(errorResponse("La nota de remisión no existe."), { status: 400 });
        if (nr.estado === "rechazada") return NextResponse.json(errorResponse("La nota de remisión está rechazada."), { status: 400 });
        const { data: otra } = await ctx.supabase.from("exportaciones").select("numero").eq("empresa_id", emp).eq("nota_remision_id", nid).neq("id", id).maybeSingle();
        if (otra) return NextResponse.json(errorResponse(`Esa nota de remisión ya está vinculada a ${(otra as { numero: string }).numero}.`), { status: 400 });
      }
      update.nota_remision_id = nid;
    }

    const cambios = diferencias(antes, update);
    if (!Object.keys(cambios).length) return NextResponse.json(successResponse({ id }));
    const { error } = await ctx.supabase
      .from("exportaciones")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("empresa_id", emp)
      .eq("id", id);
    if (error) throw new Error(error.message);
    await registrarHistorial(ctx.supabase, ctx.auth, "EXPORTACION", id, "MODIFICAR", { cambios });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/exportaciones/:id PATCH]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}

/** DELETE: solo una exportación en preparación sin productos, contenedores ni documentos. */
export async function DELETE(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const { data } = await ctx.supabase.from("exportaciones").select("estado, factura_id, nota_remision_id").eq("empresa_id", emp).eq("id", id).maybeSingle();
    const e = data as { estado: string; factura_id: string | null; nota_remision_id: string | null } | null;
    if (!e) return NextResponse.json(errorResponse("Exportación no encontrada."), { status: 404 });
    const [it, co, adj] = await Promise.all([
      ctx.supabase.from("exportacion_items").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("exportacion_id", id),
      ctx.supabase.from("comex_contenedores").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("exportacion_id", id),
      ctx.supabase.from("comex_adjuntos").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("origen_tipo", "EXPORTACION").eq("origen_id", id),
    ]);
    if (e.estado !== "preparacion" || e.factura_id || e.nota_remision_id || (it.count ?? 0) + (co.count ?? 0) + (adj.count ?? 0) > 0)
      return NextResponse.json(
        errorResponse("Solo se puede borrar una exportación vacía. Si ya tiene datos, anulala para que quede el registro."),
        { status: 400 }
      );
    await ctx.supabase.from("comex_historial").delete().eq("empresa_id", emp).eq("origen_tipo", "EXPORTACION").eq("origen_id", id);
    const { error } = await ctx.supabase.from("exportaciones").delete().eq("empresa_id", emp).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/exportaciones/:id DELETE]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
