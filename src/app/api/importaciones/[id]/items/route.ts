import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { contenedorDeOperacion, getComexCtx, registrarHistorial } from "@/lib/comex/server";

const COLS =
  "id, importacion_id, producto_id, producto_nombre, sku, cantidad, precio_unitario, moneda, subtotal, cantidad_recibida, observacion, contenedor_id";

const MONEDAS = new Set(["PYG", "USD", "BOB"]);

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const [items, seriales] = await Promise.all([
      ctx.supabase
        .from("importacion_items")
        .select(COLS)
        .eq("empresa_id", ctx.auth.empresa_id)
        .eq("importacion_id", id)
        .order("created_at", { ascending: true }),
      ctx.supabase.from("importacion_seriales").select("item_id").eq("empresa_id", ctx.auth.empresa_id).eq("importacion_id", id),
    ]);
    if (items.error) throw new Error(items.error.message);
    const cuenta = new Map<string, number>();
    for (const s of (seriales.data ?? []) as { item_id: string }[]) cuenta.set(s.item_id, (cuenta.get(s.item_id) ?? 0) + 1);
    const lista = ((items.data ?? []) as unknown as { id: string }[]).map((it) => ({ ...it, seriales_count: cuenta.get(it.id) ?? 0 }));
    return NextResponse.json(successResponse({ items: lista }));
  } catch (err) {
    console.error("[/api/importaciones/:id/items GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar los ítems."), { status: 500 });
  }
}

/** POST: agrega un producto del inventario. Solo mientras la importación es borrador. */
export async function POST(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const { data: imp } = await ctx.supabase.from("importaciones").select("estado, moneda").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (!imp) return NextResponse.json(errorResponse("Importación no encontrada."), { status: 404 });
    if ((imp as { estado: string }).estado !== "borrador")
      return NextResponse.json(errorResponse("La mercadería solo se puede cambiar mientras la importación está en borrador."), { status: 400 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const productoId = String(b.producto_id ?? "").trim();
    const cantidad = Number(b.cantidad);
    const precio = Number(b.precio_unitario);
    const moneda = String(b.moneda ?? (imp as { moneda: string }).moneda).toUpperCase();
    // Producto inexistente o no habilitado: se rechaza (PDF §3).
    if (!productoId) return NextResponse.json(errorResponse("Elegí un producto del inventario."), { status: 400 });
    const { data: prod } = await ctx.supabase
      .from("productos")
      .select("id, nombre, sku, activo")
      .eq("empresa_id", emp)
      .eq("id", productoId)
      .maybeSingle();
    const p = prod as { id: string; nombre: string; sku: string | null; activo: boolean | null } | null;
    if (!p) return NextResponse.json(errorResponse("Ese producto no existe en el inventario."), { status: 400 });
    if (p.activo === false) return NextResponse.json(errorResponse(`"${p.nombre}" está desactivado en el inventario.`), { status: 400 });
    if (!(cantidad > 0)) return NextResponse.json(errorResponse("La cantidad tiene que ser mayor a 0."), { status: 400 });
    if (!MONEDAS.has(moneda)) return NextResponse.json(errorResponse("Moneda no soportada."), { status: 400 });
    const precioOk = Number.isFinite(precio) && precio >= 0 ? precio : 0;
    const contenedorId = b.contenedor_id ? String(b.contenedor_id) : null;
    if (contenedorId && !(await contenedorDeOperacion(ctx.supabase, emp, "IMPORTACION", id, contenedorId)))
      return NextResponse.json(errorResponse("Ese contenedor no es de esta importación."), { status: 400 });

    const { data, error } = await ctx.supabase
      .from("importacion_items")
      .insert({
        empresa_id: emp,
        importacion_id: id,
        producto_id: p.id,
        producto_nombre: p.nombre,
        sku: p.sku,
        cantidad,
        precio_unitario: precioOk,
        moneda,
        subtotal: cantidad * precioOk,
        contenedor_id: contenedorId,
        observacion: b.observacion ? String(b.observacion).slice(0, 500) : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await registrarHistorial(ctx.supabase, ctx.auth, "IMPORTACION", id, "AGREGAR_PRODUCTO", { producto: p.nombre, cantidad, precio: precioOk });
    return NextResponse.json(successResponse({ id: (data as { id: string }).id }));
  } catch (err) {
    console.error("[/api/importaciones/:id/items POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
