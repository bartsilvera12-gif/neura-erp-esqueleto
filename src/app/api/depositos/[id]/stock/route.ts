import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { traerTodo } from "@/lib/comex/server";
import { filasStockDeposito, stockEnDeposito } from "@/lib/comex/stock-deposito";

/**
 * GET /api/depositos/[id]/stock — stock por producto en un depósito específico.
 * ?buscar=… para filtrar por nombre/SKU.
 */
export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ubicacionId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const { searchParams } = new URL(request.url);
    const buscar = (searchParams.get("buscar") ?? "").trim().toLowerCase();
    const soloConStock = searchParams.get("solo_con_stock") === "1";

    const ubQ = await supabase
      .from("inventario_ubicaciones")
      .select("id, nombre, codigo")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", ubicacionId)
      .maybeSingle();
    if (ubQ.error) throw new Error(ubQ.error.message);
    if (!ubQ.data) return NextResponse.json(errorResponse("Depósito no encontrado."), { status: 404 });

    // Productos activos con su stock EN ESTE depósito. Si un producto todavía no lleva
    // stock por depósito, todo su stock cuenta en su depósito principal.
    const productos = await traerTodo<{ id: string; nombre: string; sku: string | null; unidad_medida: string | null; stock_actual: number; ubicacion_principal_id: string | null }>((a, z) =>
      supabase
        .from("productos")
        .select("id, nombre, sku, unidad_medida, stock_actual, ubicacion_principal_id")
        .eq("empresa_id", auth.empresa_id)
        .eq("activo", true)
        .order("nombre")
        .order("id")
        .range(a, z)
    );
    const stockMap = stockEnDeposito(productos, await filasStockDeposito(supabase as unknown as AppSupabaseClient, auth.empresa_id), ubicacionId);

    let items = productos.map((p) => ({
      producto_id: p.id,
      nombre: p.nombre,
      sku: p.sku ?? "",
      unidad: p.unidad_medida ?? "",
      stock: stockMap.get(p.id) ?? 0,
    }));

    if (soloConStock) items = items.filter((i) => i.stock > 0);
    if (buscar) items = items.filter((i) => i.nombre.toLowerCase().includes(buscar) || i.sku.toLowerCase().includes(buscar));

    const total = items.reduce((s, i) => s + i.stock, 0);

    return NextResponse.json(successResponse({
      deposito: ubQ.data,
      items,
      total_stock: total,
      productos_con_stock: items.filter((i) => i.stock > 0).length,
    }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
