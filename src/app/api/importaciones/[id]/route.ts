import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, diferencias, registrarHistorial } from "@/lib/comex/server";
import { FLUJO_IMPORTACION, siguienteImportacion } from "@/lib/comex/estados";
import { faltantesParaEstado } from "@/lib/importaciones/validar";
import type { EstadoImportacion } from "@/lib/importaciones/types";

const COLS =
  "id, numero, proveedor_id, proveedor_nombre, pais_origen, incoterm, moneda, monto_estimado, tipo_cambio, " +
  "fecha_pedido, fecha_embarque, fecha_arribo, fecha_nacionalizacion, ubicacion_exterior_id, ubicacion_destino_py_id, " +
  "estado, observaciones, responsable_id, responsable_nombre, anulada_motivo, created_by_nombre, created_at, updated_at";

const MONEDAS = new Set(["PYG", "USD", "BOB"]);

/** GET: la importación y lo que le falta para pasar al siguiente estado. */
export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("importaciones")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json(errorResponse("Importación no encontrada."), { status: 404 });
    const imp = data as unknown as Parameters<typeof faltantesParaEstado>[2] & { estado: EstadoImportacion };
    const siguiente = siguienteImportacion(imp.estado);
    const faltantes = siguiente && imp.estado !== "anulada" ? await faltantesParaEstado(ctx.supabase, ctx.auth.empresa_id, imp, siguiente) : [];
    return NextResponse.json(successResponse({ importacion: data, siguiente, faltantes }));
  } catch (err) {
    console.error("[/api/importaciones/:id GET]", err);
    return NextResponse.json(errorResponse("No se pudo cargar la importación."), { status: 500 });
  }
}

/** PATCH: datos de la ficha. El estado se cambia por /estado. */
export async function PATCH(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const prev = await ctx.supabase.from("importaciones").select(COLS).eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle();
    if (prev.error) throw new Error(prev.error.message);
    const antes = prev.data as unknown as Record<string, unknown> | null;
    if (!antes) return NextResponse.json(errorResponse("Importación no encontrada."), { status: 404 });
    if (antes.estado === "anulada" || antes.estado === "cerrada")
      return NextResponse.json(errorResponse("La importación está cerrada o anulada; no se puede modificar."), { status: 400 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    for (const k of [
      "proveedor_id",
      "proveedor_nombre",
      "pais_origen",
      "incoterm",
      "moneda",
      "monto_estimado",
      "tipo_cambio",
      "fecha_pedido",
      "fecha_embarque",
      "fecha_arribo",
      "fecha_nacionalizacion",
      "ubicacion_exterior_id",
      "ubicacion_destino_py_id",
      "observaciones",
      "responsable_id",
      "responsable_nombre",
    ] as const) {
      if (b[k] !== undefined) update[k] = b[k] === "" ? null : b[k];
    }
    // Los obligatorios no se pueden vaciar (IMP-02).
    for (const [k, label] of [["proveedor_nombre", "el proveedor"], ["pais_origen", "el país de origen"], ["responsable_nombre", "el responsable"]] as const) {
      if (k in update && !String(update[k] ?? "").trim())
        return NextResponse.json(errorResponse(`No se puede dejar vacío ${label}.`), { status: 400 });
    }
    // Las fechas que exigió el estado actual no se pueden borrar.
    const idx = FLUJO_IMPORTACION.indexOf(antes.estado as EstadoImportacion);
    for (const [k, desde, label] of [
      ["fecha_embarque", "en_transito", "embarque"],
      ["fecha_arribo", "arribado", "arribo"],
      ["fecha_nacionalizacion", "nacionalizada", "nacionalización"],
    ] as const) {
      if (k in update && !update[k] && idx >= FLUJO_IMPORTACION.indexOf(desde))
        return NextResponse.json(errorResponse(`La fecha de ${label} no se puede borrar en este estado.`), { status: 400 });
    }
    if (update.moneda !== undefined && update.moneda !== antes.moneda) {
      const { count } = await ctx.supabase.from("importacion_items").select("id", { count: "exact", head: true }).eq("empresa_id", ctx.auth.empresa_id).eq("importacion_id", id);
      const cj = await ctx.supabase.from("importacion_caja").select("id", { count: "exact", head: true }).eq("empresa_id", ctx.auth.empresa_id).eq("importacion_id", id);
      if ((count ?? 0) + (cj.count ?? 0) > 0)
        return NextResponse.json(errorResponse("La moneda no se puede cambiar cuando ya hay mercadería o movimientos de caja."), { status: 400 });
    }
    if (update.moneda !== undefined && !MONEDAS.has(String(update.moneda)))
      return NextResponse.json(errorResponse("Moneda no soportada."), { status: 400 });
    for (const k of ["monto_estimado", "tipo_cambio"] as const) {
      if (update[k] !== undefined && update[k] !== null) {
        const n = Number(update[k]);
        if (!Number.isFinite(n) || n < 0) return NextResponse.json(errorResponse("Monto o tipo de cambio inválido."), { status: 400 });
        update[k] = n;
      }
    }

    const cambios = diferencias(antes, update);
    if (!Object.keys(cambios).length) return NextResponse.json(successResponse({ id }));
    const { error } = await ctx.supabase
      .from("importaciones")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id);
    if (error) throw new Error(error.message);
    await registrarHistorial(ctx.supabase, ctx.auth, "IMPORTACION", id, "MODIFICAR", { cambios });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/importaciones/:id PATCH]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}

/**
 * DELETE: solo un borrador vacío (sin mercadería, caja ni documentos).
 * Lo demás se anula, para no perder trazabilidad.
 */
export async function DELETE(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const { data } = await ctx.supabase.from("importaciones").select("estado").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (!data) return NextResponse.json(errorResponse("Importación no encontrada."), { status: 404 });
    const [it, cj, adj] = await Promise.all([
      ctx.supabase.from("importacion_items").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("importacion_id", id),
      ctx.supabase.from("importacion_caja").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("importacion_id", id),
      ctx.supabase.from("comex_adjuntos").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("origen_tipo", "IMPORTACION").eq("origen_id", id),
    ]);
    if ((data as { estado: string }).estado !== "borrador" || (it.count ?? 0) + (cj.count ?? 0) + (adj.count ?? 0) > 0)
      return NextResponse.json(
        errorResponse("Solo se puede borrar un borrador vacío. Si ya tiene datos, anulala para que quede el registro."),
        { status: 400 }
      );
    await ctx.supabase.from("comex_historial").delete().eq("empresa_id", emp).eq("origen_tipo", "IMPORTACION").eq("origen_id", id);
    const { error } = await ctx.supabase.from("importaciones").delete().eq("empresa_id", emp).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/importaciones/:id DELETE]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "No se pudo eliminar la importación."), { status: 500 });
  }
}
