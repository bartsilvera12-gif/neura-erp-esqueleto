import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { registrarHistorial } from "@/lib/comex/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("exportacion_items")
      .select("id, producto_id, producto_nombre, sku, cantidad, contenedor_id, observacion")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("exportacion_id", id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ items: data ?? [] }));
  } catch (err) {
    console.error("[/api/exportaciones/:id/items GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar los productos."), { status: 500 });
  }
}

/** POST { producto_id, cantidad, contenedor_id? } — solo en preparación. */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const { data: exp } = await ctx.supabase.from("exportaciones").select("estado").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (!exp) return NextResponse.json(errorResponse("Exportación no encontrada."), { status: 404 });
    if ((exp as { estado: string }).estado !== "preparacion")
      return NextResponse.json(errorResponse("Los productos solo se cambian mientras la exportación está en preparación."), { status: 400 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const productoId = String(b.producto_id ?? "").trim();
    const cantidad = Number(b.cantidad);
    if (!productoId) return NextResponse.json(errorResponse("Elegí un producto del inventario."), { status: 400 });
    if (!(cantidad > 0)) return NextResponse.json(errorResponse("La cantidad tiene que ser mayor a 0."), { status: 400 });
    const { data: prod } = await ctx.supabase.from("productos").select("id, nombre, sku, activo").eq("empresa_id", emp).eq("id", productoId).maybeSingle();
    const pr = prod as { id: string; nombre: string; sku: string | null; activo: boolean | null } | null;
    if (!pr) return NextResponse.json(errorResponse("Ese producto no existe en el inventario."), { status: 400 });
    if (pr.activo === false) return NextResponse.json(errorResponse(`"${pr.nombre}" está desactivado en el inventario.`), { status: 400 });
    const { data, error } = await ctx.supabase
      .from("exportacion_items")
      .insert({
        empresa_id: emp,
        exportacion_id: id,
        producto_id: pr.id,
        producto_nombre: pr.nombre,
        sku: pr.sku,
        cantidad,
        contenedor_id: b.contenedor_id ? String(b.contenedor_id) : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await registrarHistorial(ctx.supabase, ctx.auth, "EXPORTACION", id, "AGREGAR_PRODUCTO", { producto: pr.nombre, cantidad });
    return NextResponse.json(successResponse({ id: (data as { id: string }).id }));
  } catch (err) {
    console.error("[/api/exportaciones/:id/items POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
