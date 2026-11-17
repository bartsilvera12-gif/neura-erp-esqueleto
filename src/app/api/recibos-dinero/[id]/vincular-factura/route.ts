import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { vincularReciboAFactura, ReciboError } from "@/lib/recibos/server/recibos-pg";

/**
 * POST /api/recibos-dinero/[id]/vincular-factura — vincula un recibo existente a una factura.
 * Body: { factura_exportacion_id: string }
 * No crea cobros nuevos ni duplica importes: el recibo existente pasa a contar en la factura.
 */
export async function POST(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { factura_exportacion_id?: unknown };
    const facturaId = typeof body.factura_exportacion_id === "string" ? body.factura_exportacion_id : "";
    if (!facturaId) return NextResponse.json(errorResponse("Elegí la factura."), { status: 400 });

    const recibo = await vincularReciboAFactura(ctx.supabase, ctx.auth.empresa_id, id, facturaId);
    return NextResponse.json(successResponse({ recibo }));
  } catch (err) {
    if (err instanceof ReciboError) {
      return NextResponse.json(errorResponse(err.message), { status: err.status });
    }
    console.error("[/api/recibos-dinero/[id]/vincular-factura]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo vincular el recibo."), { status: 500 });
  }
}
