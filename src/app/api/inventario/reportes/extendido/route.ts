import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { listExtendido, computeTotalsExtendido } from "@/lib/inventario/reportes/extendido-pg";

export const runtime = "nodejs";

/** GET /api/inventario/reportes/extendido — importado/vendido/show room/exportación/saldo por producto. */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse("No autenticado."), { status: 401 });
  if (!isAdmin(auth)) return NextResponse.json(errorResponse("Solo administradores."), { status: 403 });
  try {
    const tenant = await getTenantSupabaseFromAuth(request);
    if (!tenant) return NextResponse.json(errorResponse("No autenticado."), { status: 401 });
    const empresaId = tenant.auth.empresa_id;
    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    const buscar = new URL(request.url).searchParams.get("buscar") || undefined;
    const rows = await listExtendido(schema, empresaId, { buscar });
    const totals = computeTotalsExtendido(rows);
    return NextResponse.json(successResponse({ rows, totals }));
  } catch (e) {
    console.error("[inventario/reportes/extendido]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo generar el reporte."), { status: 500 });
  }
}
