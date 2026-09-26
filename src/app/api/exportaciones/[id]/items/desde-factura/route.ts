import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, registrarHistorial } from "@/lib/comex/server";

/**
 * POST — copia a la exportación los productos de su factura vinculada.
 * Solo los que están vinculados al inventario; los demás se informan.
 */
export async function POST(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const { data } = await ctx.supabase.from("exportaciones").select("estado, factura_id").eq("empresa_id", emp).eq("id", id).maybeSingle();
    const exp = data as { estado: string; factura_id: string | null } | null;
    if (!exp) return NextResponse.json(errorResponse("Exportación no encontrada."), { status: 404 });
    if (exp.estado !== "preparacion")
      return NextResponse.json(errorResponse("Los productos solo se cambian mientras la exportación está en preparación."), { status: 400 });
    if (!exp.factura_id) return NextResponse.json(errorResponse("Primero vinculá la factura."), { status: 400 });

    const [fi, actuales] = await Promise.all([
      ctx.supabase.from("facturas_exportacion_items").select("producto_id, descripcion, codigo, cantidad").eq("empresa_id", emp).eq("factura_id", exp.factura_id).order("orden"),
      ctx.supabase.from("exportacion_items").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("exportacion_id", id),
    ]);
    if ((actuales.count ?? 0) > 0) return NextResponse.json(errorResponse("La exportación ya tiene productos. Quitalos antes de copiar los de la factura."), { status: 400 });
    const lineas = (fi.data ?? []) as { producto_id: string | null; descripcion: string; codigo: string | null; cantidad: number }[];
    if (fi.error) throw new Error(fi.error.message);
    const conProducto = lineas.filter((l) => l.producto_id && Number(l.cantidad) > 0);
    const sinProducto = lineas.filter((l) => !l.producto_id || !(Number(l.cantidad) > 0)).map((l) => l.descripcion);
    if (!conProducto.length)
      return NextResponse.json(errorResponse("La factura no tiene productos del inventario para copiar. Cargalos a mano."), { status: 400 });

    const { data: prods } = await ctx.supabase
      .from("productos")
      .select("id, nombre, sku")
      .eq("empresa_id", emp)
      .eq("activo", true)
      .in("id", conProducto.map((l) => l.producto_id as string));
    const porId = new Map(((prods ?? []) as { id: string; nombre: string; sku: string | null }[]).map((x) => [x.id, x]));
    sinProducto.push(...conProducto.filter((l) => !porId.has(l.producto_id as string)).map((l) => l.descripcion));
    const filas = conProducto
      .filter((l) => porId.has(l.producto_id as string))
      .map((l) => {
        const pr = porId.get(l.producto_id as string)!;
        return { empresa_id: emp, exportacion_id: id, producto_id: pr.id, producto_nombre: pr.nombre, sku: pr.sku, cantidad: Number(l.cantidad) };
      });
    if (!filas.length)
      return NextResponse.json(errorResponse("Ningún producto de la factura está activo en el inventario. Cargalos a mano."), { status: 400 });
    const { error } = await ctx.supabase.from("exportacion_items").insert(filas);
    if (error) throw new Error(error.message);
    await registrarHistorial(ctx.supabase, ctx.auth, "EXPORTACION", id, "COPIAR_PRODUCTOS_FACTURA", {
      copiados: filas.map((f) => `${f.producto_nombre} × ${f.cantidad}`),
    });
    return NextResponse.json(successResponse({ copiados: filas.length, sin_producto: sinProducto }));
  } catch (err) {
    console.error("[/api/exportaciones/:id/items/desde-factura POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
