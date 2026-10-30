import { NextRequest, NextResponse } from "next/server";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { requireContabilidadApiAccess } from "@/lib/contabilidad/contabilidad-auth";
import { sweepContabilizarCompras } from "@/lib/contabilidad/compras-asientos-pg";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/contabilidad/backfill-compras — contabiliza de forma idempotente
 * todas las compras vigentes del Libro de Compras que aún no tengan asiento.
 * No duplica asientos. Requiere permiso de Contabilidad.
 */
export async function POST(request: NextRequest) {
  const auth = await requireContabilidadApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  try {
    const schema = await fetchDataSchemaForEmpresaId(auth.empresaId);
    const result = await sweepContabilizarCompras(schema, auth.empresaId, auth.usuarioCatalogId);
    return NextResponse.json(successResponse({ result }));
  } catch (err) {
    console.error("[/api/contabilidad/backfill-compras POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo ejecutar el backfill de compras."), { status: 500 });
  }
}
