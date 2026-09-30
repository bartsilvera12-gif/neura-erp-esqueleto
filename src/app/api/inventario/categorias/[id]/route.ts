import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { normalizeUpperText, normalizeUpperNullable } from "@/lib/text/normalize";

export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const patch: Record<string, unknown> = {};
    if (body.nombre !== undefined) patch.nombre = normalizeUpperText(body.nombre);
    if (body.codigo !== undefined) patch.codigo = normalizeUpperNullable(body.codigo);
    if (body.descripcion !== undefined) patch.descripcion = normalizeUpperNullable(body.descripcion);
    if (body.parent_id !== undefined) patch.parent_id = body.parent_id == null ? null : String(body.parent_id);
    if (body.activo !== undefined) patch.activo = body.activo === true;

    if (Object.keys(patch).length === 0) {
      const { data, error } = await ctx.supabase
        .from("categorias_productos")
        .select("id, empresa_id, nombre, codigo, descripcion, parent_id, activo, created_at, updated_at")
        .eq("empresa_id", ctx.auth.empresa_id)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
      return NextResponse.json(successResponse({ categoria: data }));
    }

    const upd = await ctx.supabase
      .from("categorias_productos")
      .update(patch)
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id)
      .select("id, empresa_id, nombre, codigo, descripcion, parent_id, activo, created_at, updated_at")
      .maybeSingle();
    if (upd.error) {
      const msg = upd.error.message ?? "";
      if (/duplicate|unique|23505/i.test(msg)) {
        return NextResponse.json(errorResponse("Ya existe una categoría con ese nombre o código."), {
          status: 409,
        });
      }
      console.error("[/api/inventario/categorias/[id] PATCH]", msg);
      return NextResponse.json(errorResponse("No se pudo actualizar la categoría."), { status: 500 });
    }
    if (!upd.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    return NextResponse.json(successResponse({ categoria: upd.data }));
  } catch (err) {
    console.error("[/api/inventario/categorias/[id] PATCH] outer", err);
    return NextResponse.json(errorResponse("No se pudo actualizar la categoría."), { status: 500 });
  }
}

/**
 * DELETE — borra una categoría. No se puede si tiene productos o categorías
 * hijas: primero hay que moverlos (o desactivar la categoría).
 */
export async function DELETE(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;

    const [principal, secundaria, hijas] = await Promise.all([
      ctx.supabase.from("productos").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("categoria_principal_id", id),
      ctx.supabase.from("producto_categorias").select("producto_id", { count: "exact", head: true }).eq("categoria_id", id),
      ctx.supabase.from("categorias_productos").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("parent_id", id),
    ]);
    const productos = (principal.count ?? 0) + (secundaria.count ?? 0);
    if (productos > 0)
      return NextResponse.json(errorResponse(`Esta categoría tiene ${productos} producto(s). Pasalos a otra categoría antes de borrarla, o desactivala.`), { status: 409 });
    if ((hijas.count ?? 0) > 0)
      return NextResponse.json(errorResponse(`Esta categoría tiene ${hijas.count} categoría(s) adentro. Borrá o mové esas primero.`), { status: 409 });

    const del = await ctx.supabase.from("categorias_productos").delete().eq("empresa_id", emp).eq("id", id).select("id");
    if (del.error) {
      if (/foreign key|23503/i.test(del.error.message))
        return NextResponse.json(errorResponse("La categoría está en uso y no se puede borrar. Podés desactivarla."), { status: 409 });
      throw new Error(del.error.message);
    }
    if (!(del.data ?? []).length) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/inventario/categorias/[id] DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo borrar la categoría."), { status: 500 });
  }
}
