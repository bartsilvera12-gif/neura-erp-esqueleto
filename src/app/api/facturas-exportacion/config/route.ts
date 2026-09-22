import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

const COLS =
  "id, establecimiento, punto_expedicion, timbrado, vigencia_desde, vigencia_hasta, " +
  "rango_desde, rango_hasta, proximo_numero, activo, tipo, ruc, autoimpresor_nro";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("facturas_exportacion_config")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("punto_expedicion");
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ config: data ?? [] }));
  } catch (err) {
    console.error("[/api/facturas-exportacion/config GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar la configuración."), { status: 500 });
  }
}
