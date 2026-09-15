import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS =
  "id, numero, proveedor_id, proveedor_nombre, pais_origen, incoterm, moneda, monto_estimado, tipo_cambio, " +
  "fecha_pedido, fecha_embarque, fecha_arribo, fecha_nacionalizacion, ubicacion_exterior_id, ubicacion_destino_py_id, " +
  "estado, observaciones, created_at, updated_at";

const ESTADOS = new Set([
  "borrador",
  "en_transito",
  "arribado",
  "nacionalizada",
  "entregada",
  "cerrada",
  "anulada",
]);

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("importaciones")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json(errorResponse("Importación no encontrada."), { status: 404 });
    return NextResponse.json(successResponse({ importacion: data }));
  } catch (err) {
    console.error("[/api/importaciones/:id GET]", err);
    return NextResponse.json(errorResponse("No se pudo cargar la importación."), { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.estado !== undefined) {
      const s = String(b.estado);
      if (!ESTADOS.has(s)) return NextResponse.json(errorResponse("Estado inválido."), { status: 400 });
      update.estado = s;
    }
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
    ] as const) {
      if (b[k] !== undefined) update[k] = b[k] === "" ? null : b[k];
    }
    const { error } = await ctx.supabase
      .from("importaciones")
      .update(update)
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/importaciones/:id PATCH]", err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "Error interno"),
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    // Los items y caja tienen ON DELETE CASCADE — se borran solos con la importacion.
    const { error } = await ctx.supabase
      .from("importaciones")
      .delete()
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/importaciones/:id DELETE]", err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "No se pudo eliminar la importación."),
      { status: 500 },
    );
  }
}
