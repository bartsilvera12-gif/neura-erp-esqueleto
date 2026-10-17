import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esInstanciaLR } from "@/lib/inventario/campos-lr";

/**
 * GET /api/inventario/movimientos — lista movimientos via PostgREST (compat Hostinger sin pool PG).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;

    // Kardex de un producto: todos sus movimientos en orden cronológico ascendente
    // (para ir acumulando saldo). Sin producto: últimos 500 de toda la empresa.
    const productoId = new URL(request.url).searchParams.get("producto_id");

    // ubicacion_id (almacén) y observacion (razón) existen solo en esqueletoerp.
    const extraLR = esInstanciaLR() ? ", ubicacion_id, observacion" : "";
    let q = ctx.supabase
      .from("movimientos_inventario")
      .select(
        "id, empresa_id, producto_id, producto_nombre, producto_sku, tipo, cantidad, costo_unitario, origen, referencia, fecha, created_at, updated_at, created_by, usuario_nombre" +
          extraLR
      )
      .eq("empresa_id", empresaId);
    q = productoId
      ? q.eq("producto_id", productoId).order("fecha", { ascending: true }).order("created_at", { ascending: true }).limit(5000)
      : q.order("fecha", { ascending: false }).limit(500);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    return NextResponse.json(successResponse({ movimientos: data ?? [] }));
  } catch (err) {
    console.error("[/api/inventario/movimientos GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los movimientos."), { status: 500 });
  }
}
