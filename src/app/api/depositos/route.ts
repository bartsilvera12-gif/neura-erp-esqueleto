import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { traerTodo } from "@/lib/comex/server";
import { filasStockDeposito, stockEnDeposito, type ProdStock } from "@/lib/comex/stock-deposito";

/**
 * GET /api/depositos — lista ubicaciones con total de stock y productos con stock.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const ubQ = await supabase
      .from("inventario_ubicaciones")
      .select("id, nombre, codigo, tipo, activo")
      .eq("empresa_id", auth.empresa_id)
      .eq("activo", true)
      .order("nombre");
    if (ubQ.error) return NextResponse.json(errorResponse(ubQ.error.message), { status: 400 });

    // Stock por depósito: el mismo que usan transferencias, compras, importaciones y remisiones.
    const sb = supabase as unknown as AppSupabaseClient;
    const [filas, prods] = await Promise.all([
      filasStockDeposito(sb, auth.empresa_id),
      traerTodo<ProdStock>((a, z) => supabase.from("productos").select("id, stock_actual, ubicacion_principal_id").eq("empresa_id", auth.empresa_id).eq("activo", true).order("id").range(a, z)),
    ]);
    const totales = new Map<string, { total: number; productos_con_stock: number }>();
    for (const u of (ubQ.data ?? []) as Array<{ id: string }>) {
      let total = 0;
      let con = 0;
      for (const v of stockEnDeposito(prods, filas, u.id).values()) {
        total += v;
        if (v > 0) con += 1;
      }
      totales.set(u.id, { total, productos_con_stock: con });
    }

    const depositos = ((ubQ.data ?? []) as Array<{ id: string; nombre: string; codigo: string; tipo: string; activo: boolean }>).map((u) => {
      const t = totales.get(u.id) ?? { total: 0, productos_con_stock: 0 };
      return {
        id: u.id,
        nombre: u.nombre,
        codigo: u.codigo,
        tipo: u.tipo,
        activo: u.activo,
        total_stock: t.total,
        productos_con_stock: t.productos_con_stock,
      };
    });

    return NextResponse.json(successResponse({ depositos }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
