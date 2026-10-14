import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  asegurarStockPorDeposito,
  filasStockDeposito,
  stockEnDeposito,
  type ProdStock,
} from "@/lib/comex/stock-deposito";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

/**
 * POST /api/inventario/transferencias/bulk
 * Transfiere en bloque varios productos de un almacén a otro.
 * Body: { producto_ids: string[], ubicacion_origen_id, ubicacion_destino_id, observacion? }
 *
 * Para cada producto se transfiere la cantidad que tiene en el almacén de origen.
 * Los que no tienen stock en el origen se omiten (se informan). Reusa el RPC
 * atómico transferir_stock_entre_depositos por producto.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const body = await request.json().catch(() => null);
    const {
      producto_ids,
      ubicacion_origen_id,
      ubicacion_destino_id,
      observacion,
    } = (body ?? {}) as {
      producto_ids?: string[];
      ubicacion_origen_id?: string;
      ubicacion_destino_id?: string;
      observacion?: string;
    };

    if (!Array.isArray(producto_ids) || producto_ids.length === 0) {
      return NextResponse.json(errorResponse("No se seleccionaron productos."), { status: 400 });
    }
    if (!ubicacion_origen_id || !ubicacion_destino_id) {
      return NextResponse.json(errorResponse("Faltan los almacenes de origen y destino."), { status: 400 });
    }
    if (ubicacion_origen_id === ubicacion_destino_id) {
      return NextResponse.json(errorResponse("El almacén de origen y destino deben ser distintos."), { status: 400 });
    }
    const ids = Array.from(new Set(producto_ids.filter(Boolean))).slice(0, 1000);
    const empresaId = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;

    // Stock de cada producto en el almacén de origen.
    const { data: prodData, error: prodErr } = await ctx.supabase
      .from("productos")
      .select("id, stock_actual, ubicacion_principal_id")
      .eq("empresa_id", empresaId)
      .in("id", ids);
    if (prodErr) throw new Error(prodErr.message);
    const productos = (prodData ?? []) as ProdStock[];

    // Asegurar que el stock previo quede materializado por depósito antes de mover.
    for (const p of productos) {
      await asegurarStockPorDeposito(sb, empresaId, p.id);
    }
    const filas = await filasStockDeposito(sb, empresaId, ids);
    const stockOrigen = stockEnDeposito(productos, filas, ubicacion_origen_id);

    let movidos = 0;
    let sinStock = 0;
    const errores: string[] = [];

    for (const p of productos) {
      const qty = stockOrigen.get(p.id) ?? 0;
      if (!(qty > 0)) { sinStock++; continue; }
      const { error } = await ctx.supabase.rpc("transferir_stock_entre_depositos", {
        p_empresa_id: empresaId,
        p_producto_id: p.id,
        p_cantidad: qty,
        p_ubic_origen_id: ubicacion_origen_id,
        p_ubic_destino_id: ubicacion_destino_id,
        p_observacion: observacion ?? null,
        p_usuario_id: ctx.auth.usuarioCatalogId ?? null,
      });
      if (error) errores.push(`${p.id}: ${error.message}`);
      else movidos++;
    }

    return NextResponse.json(
      successResponse({
        total: productos.length,
        movidos,
        sin_stock: sinStock,
        errores: errores.length,
        detalle_errores: errores.slice(0, 10),
      })
    );
  } catch (err) {
    console.error("[/api/inventario/transferencias/bulk POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
