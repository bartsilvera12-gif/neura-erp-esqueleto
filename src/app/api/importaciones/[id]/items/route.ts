import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS =
  "id, importacion_id, producto_id, producto_nombre, sku, cantidad, precio_unitario, moneda, subtotal, cantidad_recibida, observacion";

const MONEDAS = new Set(["PYG", "USD", "BOB"]);

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("importacion_items")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("importacion_id", id)
      .order("id", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ items: data ?? [] }));
  } catch (err) {
    console.error("[/api/importaciones/:id/items GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar los ítems."), { status: 500 });
  }
}

export async function POST(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = String(b.producto_nombre ?? "").trim();
    const cantidad = Number(b.cantidad);
    const precio = Number(b.precio_unitario);
    const moneda = String(b.moneda ?? "USD").toUpperCase();
    if (!nombre) return NextResponse.json(errorResponse("Producto requerido."), { status: 400 });
    if (!(cantidad > 0)) return NextResponse.json(errorResponse("Cantidad inválida."), { status: 400 });
    if (!MONEDAS.has(moneda)) return NextResponse.json(errorResponse("Moneda no soportada."), { status: 400 });
    const subtotal = cantidad * (Number.isFinite(precio) ? precio : 0);

    const { data, error } = await ctx.supabase
      .from("importacion_items")
      .insert({
        empresa_id: ctx.auth.empresa_id,
        importacion_id: id,
        producto_id: b.producto_id ? String(b.producto_id) : null,
        producto_nombre: nombre,
        sku: b.sku ? String(b.sku).trim().slice(0, 50) : null,
        cantidad,
        precio_unitario: Number.isFinite(precio) ? precio : 0,
        moneda,
        subtotal,
        observacion: b.observacion ? String(b.observacion).slice(0, 500) : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id: (data as { id: string }).id }));
  } catch (err) {
    console.error("[/api/importaciones/:id/items POST]", err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "Error interno"),
      { status: 500 },
    );
  }
}
