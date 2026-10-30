import { NextRequest, NextResponse } from "next/server";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { getComexCtx } from "@/lib/comex/server";
import { sweepContabilizarCompras } from "@/lib/contabilidad/compras-asientos-pg";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/contabilidad/backfill-compras — contabiliza de forma idempotente
 * todas las compras vigentes del Libro de Compras que aún no tengan asiento.
 * No duplica asientos. Tarea de mantenimiento: la puede ejecutar un admin de la
 * empresa.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede ejecutar el backfill."), { status: 403 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const result = await sweepContabilizarCompras(schema, ctx.auth.empresa_id, ctx.auth.usuarioCatalogId ?? null);
    return NextResponse.json(successResponse({ result }));
  } catch (err) {
    console.error("[/api/contabilidad/backfill-compras POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo ejecutar el backfill de compras."), { status: 500 });
  }
}
