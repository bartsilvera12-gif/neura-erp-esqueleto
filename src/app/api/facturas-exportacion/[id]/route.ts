import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const cab = await ctx.supabase
      .from("facturas_exportacion")
      .select("*")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (cab.error) throw new Error(cab.error.message);
    if (!cab.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const items = await ctx.supabase
      .from("facturas_exportacion_items")
      .select("id, producto_id, descripcion, cantidad, precio_unitario, subtotal, iva_tipo, orden")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("factura_id", id)
      .order("orden", { ascending: true });
    if (items.error) throw new Error(items.error.message);

    return NextResponse.json(
      successResponse({ factura: { ...(cab.data as unknown as Record<string, unknown>), items: items.data ?? [] } })
    );
  } catch (err) {
    console.error("[/api/facturas-exportacion/[id] GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar la factura."), { status: 500 });
  }
}
