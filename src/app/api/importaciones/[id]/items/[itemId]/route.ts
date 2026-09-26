import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { diferencias, registrarHistorial } from "@/lib/comex/server";

type Params = { params: Promise<{ id: string; itemId: string }> };

async function cargar(request: NextRequest, p: Params) {
  const { id, itemId } = await p.params;
  const ctx = await getTenantSupabaseFromAuthWithRol(request);
  if (!ctx) return { res: NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 }) };
  const emp = ctx.auth.empresa_id;
  const [imp, item] = await Promise.all([
    ctx.supabase.from("importaciones").select("estado").eq("empresa_id", emp).eq("id", id).maybeSingle(),
    ctx.supabase
      .from("importacion_items")
      .select("id, producto_id, producto_nombre, sku, cantidad, precio_unitario, contenedor_id, observacion")
      .eq("empresa_id", emp)
      .eq("importacion_id", id)
      .eq("id", itemId)
      .maybeSingle(),
  ]);
  if (!imp.data || !item.data) return { res: NextResponse.json(errorResponse("Ítem no encontrado."), { status: 404 }) };
  return { ctx, id, itemId, estado: (imp.data as { estado: string }).estado, item: item.data as Record<string, unknown> };
}

/**
 * PATCH: en borrador se puede cambiar todo; después solo el contenedor y la
 * observación (la cantidad pedida ya no se toca: queda como referencia).
 */
export async function PATCH(request: NextRequest, p: Params) {
  try {
    const r = await cargar(request, p);
    if ("res" in r) return r.res;
    const { ctx, id, itemId, estado, item } = r;
    if (estado === "anulada" || estado === "cerrada")
      return NextResponse.json(errorResponse("La importación está cerrada o anulada."), { status: 400 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (b.contenedor_id !== undefined) update.contenedor_id = b.contenedor_id || null;
    if (b.observacion !== undefined) update.observacion = b.observacion ? String(b.observacion).slice(0, 500) : null;

    const tocaPedido = b.producto_id !== undefined || b.cantidad !== undefined || b.precio_unitario !== undefined;
    if (tocaPedido && estado !== "borrador")
      return NextResponse.json(errorResponse("El producto, la cantidad y el precio solo se cambian en borrador."), { status: 400 });
    if (b.producto_id !== undefined) {
      const { data: prod } = await ctx.supabase
        .from("productos")
        .select("id, nombre, sku, activo")
        .eq("empresa_id", ctx.auth.empresa_id)
        .eq("id", String(b.producto_id))
        .maybeSingle();
      const pr = prod as { id: string; nombre: string; sku: string | null; activo: boolean | null } | null;
      if (!pr || pr.activo === false) return NextResponse.json(errorResponse("Ese producto no existe o está desactivado."), { status: 400 });
      Object.assign(update, { producto_id: pr.id, producto_nombre: pr.nombre, sku: pr.sku });
    }
    const cantidad = b.cantidad !== undefined ? Number(b.cantidad) : Number(item.cantidad);
    const precio = b.precio_unitario !== undefined ? Number(b.precio_unitario) : Number(item.precio_unitario);
    if (b.cantidad !== undefined) {
      if (!(cantidad > 0)) return NextResponse.json(errorResponse("La cantidad tiene que ser mayor a 0."), { status: 400 });
      update.cantidad = cantidad;
    }
    if (b.precio_unitario !== undefined) {
      if (!(precio >= 0)) return NextResponse.json(errorResponse("Precio inválido."), { status: 400 });
      update.precio_unitario = precio;
    }
    if (b.cantidad !== undefined || b.precio_unitario !== undefined) update.subtotal = cantidad * precio;

    const cambios = diferencias(item, update);
    if (!Object.keys(cambios).length) return NextResponse.json(successResponse({ id: itemId }));
    const { error } = await ctx.supabase
      .from("importacion_items")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", itemId);
    if (error) throw new Error(error.message);
    await registrarHistorial(ctx.supabase, ctx.auth, "IMPORTACION", id, "MODIFICAR_PRODUCTO", { producto: item.producto_nombre, cambios });
    return NextResponse.json(successResponse({ id: itemId }));
  } catch (err) {
    console.error("[/api/importaciones/:id/items/:itemId PATCH]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}

/** DELETE: solo en borrador. */
export async function DELETE(request: NextRequest, p: Params) {
  try {
    const r = await cargar(request, p);
    if ("res" in r) return r.res;
    const { ctx, id, itemId, estado, item } = r;
    if (estado !== "borrador")
      return NextResponse.json(errorResponse("La mercadería solo se puede quitar mientras la importación está en borrador."), { status: 400 });
    const { error } = await ctx.supabase.from("importacion_items").delete().eq("empresa_id", ctx.auth.empresa_id).eq("id", itemId);
    if (error) throw new Error(error.message);
    await registrarHistorial(ctx.supabase, ctx.auth, "IMPORTACION", id, "QUITAR_PRODUCTO", { producto: item.producto_nombre, cantidad: item.cantidad });
    return NextResponse.json(successResponse({ id: itemId }));
  } catch (err) {
    console.error("[/api/importaciones/:id/items/:itemId DELETE]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
