import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esUuid, getComexCtx, nombreUsuario } from "@/lib/comex/server";

type Params = { params: Promise<{ id: string }> };

async function abierto(ctx: NonNullable<Awaited<ReturnType<typeof getComexCtx>>>, id: string) {
  const { data } = await ctx.supabase.from("inventario_conteos").select("estado").eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle();
  return (data as { estado?: string } | null)?.estado ?? null;
}

/**
 * PATCH { items: [{ id, cantidad_fisica, motivo }] } — carga lo contado.
 * Solo con el conteo en curso. No toca el stock del sistema (INV-01).
 */
export async function PATCH(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const estado = await abierto(ctx, id);
    if (!estado) return NextResponse.json(errorResponse("El conteo no existe."), { status: 404 });
    if (estado !== "en_curso") return NextResponse.json(errorResponse("El conteo está cerrado: reabrilo para cambiar cantidades."), { status: 400 });
    const b = (await request.json().catch(() => ({}))) as { items?: { id?: string; cantidad_fisica?: unknown; motivo?: unknown }[] };
    const items = (b.items ?? []).filter((x) => esUuid(x.id));
    const ahora = new Date().toISOString();
    for (const x of items) {
      const v = x.cantidad_fisica === "" || x.cantidad_fisica == null ? null : Number(x.cantidad_fisica);
      if (v !== null && !(Number.isFinite(v) && v >= 0)) return NextResponse.json(errorResponse("Las cantidades tienen que ser números de 0 para arriba."), { status: 400 });
      const { error } = await ctx.supabase
        .from("inventario_conteo_items")
        .update({
          cantidad_fisica: v,
          motivo: x.motivo ? String(x.motivo).trim().slice(0, 300) : null,
          contado_por_nombre: v === null ? null : nombreUsuario(ctx.auth),
          contado_at: v === null ? null : ahora,
        })
        .eq("empresa_id", ctx.auth.empresa_id)
        .eq("conteo_id", id)
        .eq("id", x.id as string);
      if (error) throw new Error(error.message);
    }
    await ctx.supabase.from("inventario_conteos").update({ updated_at: ahora }).eq("id", id);
    return NextResponse.json(successResponse({ guardados: items.length }));
  } catch (err) {
    console.error("[/api/comex/conteos/:id/items PATCH]", err);
    return NextResponse.json(errorResponse("No se pudieron guardar las cantidades."), { status: 500 });
  }
}

/** POST { producto_id } — agrega un producto encontrado que no estaba en la lista. */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if ((await abierto(ctx, id)) !== "en_curso") return NextResponse.json(errorResponse("El conteo no está en curso."), { status: 400 });
    const b = (await request.json().catch(() => ({}))) as { producto_id?: string };
    if (!esUuid(b.producto_id)) return NextResponse.json(errorResponse("Elegí el producto."), { status: 400 });
    const { data: prod } = await ctx.supabase.from("productos").select("id, nombre, sku, stock_actual").eq("empresa_id", ctx.auth.empresa_id).eq("id", b.producto_id).maybeSingle();
    const pr = prod as { id: string; nombre: string; sku: string | null; stock_actual: number } | null;
    if (!pr) return NextResponse.json(errorResponse("Ese producto no existe."), { status: 400 });
    const { error } = await ctx.supabase
      .from("inventario_conteo_items")
      .insert({ empresa_id: ctx.auth.empresa_id, conteo_id: id, producto_id: pr.id, producto_nombre: pr.nombre, sku: pr.sku, stock_sistema: Number(pr.stock_actual) || 0 });
    if (error) {
      if (error.code === "23505") return NextResponse.json(errorResponse("Ese producto ya está en el conteo."), { status: 400 });
      throw new Error(error.message);
    }
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    console.error("[/api/comex/conteos/:id/items POST]", err);
    return NextResponse.json(errorResponse("No se pudo agregar el producto."), { status: 500 });
  }
}
