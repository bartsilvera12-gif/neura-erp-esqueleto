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
  const [exp, item] = await Promise.all([
    ctx.supabase.from("exportaciones").select("estado").eq("empresa_id", emp).eq("id", id).maybeSingle(),
    ctx.supabase
      .from("exportacion_items")
      .select("id, producto_id, producto_nombre, cantidad, contenedor_id")
      .eq("empresa_id", emp)
      .eq("exportacion_id", id)
      .eq("id", itemId)
      .maybeSingle(),
  ]);
  if (!exp.data || !item.data) return { res: NextResponse.json(errorResponse("Producto no encontrado."), { status: 404 }) };
  return { ctx, id, itemId, estado: (exp.data as { estado: string }).estado, item: item.data as Record<string, unknown> };
}

/** PATCH: en preparación todo; después solo el contenedor (antes de despachar). */
export async function PATCH(request: NextRequest, p: Params) {
  try {
    const r = await cargar(request, p);
    if ("res" in r) return r.res;
    const { ctx, id, itemId, estado, item } = r;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (b.contenedor_id !== undefined) {
      if (!["preparacion", "documentacion"].includes(estado))
        return NextResponse.json(errorResponse("El contenedor se asigna antes de aprobar el despacho."), { status: 400 });
      update.contenedor_id = b.contenedor_id || null;
    }
    if (b.producto_id !== undefined || b.cantidad !== undefined) {
      if (estado !== "preparacion")
        return NextResponse.json(errorResponse("Los productos solo se cambian mientras la exportación está en preparación."), { status: 400 });
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
      if (b.cantidad !== undefined) {
        const c = Number(b.cantidad);
        if (!(c > 0)) return NextResponse.json(errorResponse("La cantidad tiene que ser mayor a 0."), { status: 400 });
        update.cantidad = c;
      }
    }
    const cambios = diferencias(item, update);
    if (!Object.keys(cambios).length) return NextResponse.json(successResponse({ id: itemId }));
    const { error } = await ctx.supabase
      .from("exportacion_items")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", itemId);
    if (error) throw new Error(error.message);
    await registrarHistorial(ctx.supabase, ctx.auth, "EXPORTACION", id, "MODIFICAR_PRODUCTO", { producto: item.producto_nombre, cambios });
    return NextResponse.json(successResponse({ id: itemId }));
  } catch (err) {
    console.error("[/api/exportaciones/:id/items/:itemId PATCH]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}

export async function DELETE(request: NextRequest, p: Params) {
  try {
    const r = await cargar(request, p);
    if ("res" in r) return r.res;
    const { ctx, id, itemId, estado, item } = r;
    if (estado !== "preparacion")
      return NextResponse.json(errorResponse("Los productos solo se quitan mientras la exportación está en preparación."), { status: 400 });
    const { error } = await ctx.supabase.from("exportacion_items").delete().eq("empresa_id", ctx.auth.empresa_id).eq("id", itemId);
    if (error) throw new Error(error.message);
    await registrarHistorial(ctx.supabase, ctx.auth, "EXPORTACION", id, "QUITAR_PRODUCTO", { producto: item.producto_nombre, cantidad: item.cantidad });
    return NextResponse.json(successResponse({ id: itemId }));
  } catch (err) {
    console.error("[/api/exportaciones/:id/items/:itemId DELETE]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
