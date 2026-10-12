import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { listAlmacenes, totalAlmacenes } from "@/lib/inventario/reportes/almacenes-pg";

export const runtime = "nodejs";

/** GET /api/inventario/reportes/almacenes — físico/entradas/salidas/vendido por depósito. */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return NextResponse.json(errorResponse("No autenticado."), { status: 401 });
  if (!isAdmin(auth)) return NextResponse.json(errorResponse("Solo administradores."), { status: 403 });
  try {
    const tenant = await getTenantSupabaseFromAuth(request);
    if (!tenant) return NextResponse.json(errorResponse("No autenticado."), { status: 401 });
    const empresaId = tenant.auth.empresa_id;
    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    const url = new URL(request.url);
    const desde = url.searchParams.get("desde") || undefined;
    const hasta = url.searchParams.get("hasta") || undefined;
    const rows = await listAlmacenes(schema, empresaId, { desde, hasta });
    const total = totalAlmacenes(rows);
    return NextResponse.json(successResponse({ rows, total }));
  } catch (e) {
    console.error("[inventario/reportes/almacenes]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo generar el reporte."), { status: 500 });
  }
}
