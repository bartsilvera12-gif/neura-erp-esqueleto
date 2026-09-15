import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/inventario/transferencias — lista transferencias (agrupa SALIDA + ENTRADA
 * por transferencia_id). Devuelve una fila por transferencia.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;

    const { data, error } = await ctx.supabase
      .from("movimientos_inventario")
      .select(
        "id, transferencia_id, producto_id, producto_nombre, producto_sku, tipo, cantidad, costo_unitario, referencia, fecha, observacion, ubicacion_origen_id, ubicacion_destino_id, created_by, usuario_nombre"
      )
      .eq("empresa_id", empresaId)
      .eq("origen", "transferencia")
      .order("fecha", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);

    type Row = NonNullable<typeof data>[number];
    const grupos = new Map<
      string,
      {
        transferencia_id: string;
        referencia: string | null;
        fecha: string;
        producto_id: string;
        producto_nombre: string;
        producto_sku: string;
        cantidad: number;
        ubicacion_origen_id: string | null;
        ubicacion_destino_id: string | null;
        observacion: string | null;
        usuario_nombre: string | null;
      }
    >();

    for (const m of (data ?? []) as Row[]) {
      const tid = m.transferencia_id;
      if (!tid) continue;
      const prev = grupos.get(tid) ?? {
        transferencia_id: tid,
        referencia: m.referencia ?? null,
        fecha: m.fecha,
        producto_id: m.producto_id,
        producto_nombre: m.producto_nombre,
        producto_sku: m.producto_sku,
        cantidad: Number(m.cantidad),
        ubicacion_origen_id: null,
        ubicacion_destino_id: null,
        observacion: m.observacion ?? null,
        usuario_nombre: m.usuario_nombre ?? null,
      };
      if (m.tipo === "SALIDA" && m.ubicacion_origen_id) {
        prev.ubicacion_origen_id = m.ubicacion_origen_id;
      }
      if (m.tipo === "ENTRADA" && m.ubicacion_destino_id) {
        prev.ubicacion_destino_id = m.ubicacion_destino_id;
      }
      grupos.set(tid, prev);
    }

    return NextResponse.json(
      successResponse({ transferencias: Array.from(grupos.values()) })
    );
  } catch (err) {
    console.error("[/api/inventario/transferencias GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las transferencias."), { status: 500 });
  }
}

/**
 * POST /api/inventario/transferencias
 * Body: { producto_id, cantidad, ubicacion_origen_id, ubicacion_destino_id, observacion? }
 * Llama al RPC transferir_stock_entre_depositos (operacion atomica en Postgres).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(errorResponse("Body invalido."), { status: 400 });
    }
    const {
      producto_id,
      cantidad,
      ubicacion_origen_id,
      ubicacion_destino_id,
      observacion,
    } = body as {
      producto_id?: string;
      cantidad?: number | string;
      ubicacion_origen_id?: string;
      ubicacion_destino_id?: string;
      observacion?: string;
    };

    if (!producto_id || !ubicacion_origen_id || !ubicacion_destino_id) {
      return NextResponse.json(
        errorResponse("Faltan datos obligatorios (producto, origen, destino)."),
        { status: 400 }
      );
    }
    const qty = Number(cantidad);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json(errorResponse("Cantidad invalida."), { status: 400 });
    }
    if (ubicacion_origen_id === ubicacion_destino_id) {
      return NextResponse.json(
        errorResponse("El deposito de origen y destino deben ser distintos."),
        { status: 400 }
      );
    }

    const { data, error } = await ctx.supabase.rpc("transferir_stock_entre_depositos", {
      p_empresa_id: ctx.auth.empresa_id,
      p_producto_id: producto_id,
      p_cantidad: qty,
      p_ubic_origen_id: ubicacion_origen_id,
      p_ubic_destino_id: ubicacion_destino_id,
      p_observacion: observacion ?? null,
      p_usuario_id: ctx.auth.usuarioCatalogId ?? null,
    });

    if (error) {
      const msg = error.message || "No se pudo transferir el stock.";
      return NextResponse.json(errorResponse(msg), { status: 400 });
    }

    return NextResponse.json(
      successResponse({ transferencia_id: data as string })
    );
  } catch (err) {
    console.error("[/api/inventario/transferencias POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "Error interno"),
      { status: 500 }
    );
  }
}
