import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth, getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const cab = await ctx.supabase
      .from("facturas_exportacion")
      .select("*")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (cab.error) throw new Error(cab.error.message);
    if (!cab.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const items = await ctx.supabase
      .from("facturas_exportacion_items")
      .select("id, producto_id, codigo, descripcion, unidad, cantidad, precio_unitario, descuento, subtotal, iva_tipo, orden")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("factura_id", id)
      .order("orden", { ascending: true });
    if (items.error) throw new Error(items.error.message);

    return NextResponse.json(
      successResponse({ factura: { ...(cab.data as unknown as Record<string, unknown>), items: items.data ?? [] } })
    );
  } catch (err) {
    console.error("[/api/facturas-exportacion/[id] GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar la factura."), { status: 500 });
  }
}

/** DELETE — solo borradores: todavía no tienen número fiscal. Una emitida se anula, no se borra. */
export async function DELETE(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const del = await ctx.supabase
      .from("facturas_exportacion")
      .delete()
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id)
      .eq("estado", "BORRADOR")
      .select("id");
    if (del.error) throw new Error(del.error.message);
    if (!(del.data ?? []).length)
      return NextResponse.json(errorResponse("Solo se pueden borrar borradores. Una factura emitida se anula."), { status: 400 });
    await ctx.supabase.from("facturas_exportacion_auditoria").insert({
      empresa_id: ctx.auth.empresa_id,
      accion: "BORRADOR_ELIMINAR",
      detalle: { factura_id: id },
      usuario_id: ctx.auth.user.id,
      usuario_nombre: ctx.auth.nombre ?? ctx.auth.user.email ?? null,
    });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/facturas-exportacion/[id] DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo borrar el borrador."), { status: 500 });
  }
}
