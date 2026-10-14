import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { listProductosDeAlmacen } from "@/lib/inventario/reportes/almacenes-pg";
import { conteoFisicoHtml, fechaHoyDoc } from "@/lib/inventario/reportes/conteo-pdf";

export const runtime = "nodejs";

/**
 * GET /api/inventario/reportes/almacenes/[id]/imprimir?auto=1
 * Hoja de conteo físico (PDF) de los productos de UN almacén.
 */
export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParams.params;
  const auth = await getAuthWithRol(request);
  if (!auth) return new NextResponse("No autenticado", { status: 401 });
  if (!isAdmin(auth)) return new NextResponse("Solo administradores", { status: 403 });
  try {
    const tenant = await getTenantSupabaseFromAuth(request);
    if (!tenant) return new NextResponse("No autenticado", { status: 401 });
    const empresaId = tenant.auth.empresa_id;
    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    const auto = new URL(request.url).searchParams.get("auto") === "1";
    const { nombre, filas } = await listProductosDeAlmacen(schema, empresaId, id);

    const html = conteoFisicoHtml({
      titulo: `CONTEO FÍSICO — ${(nombre ?? "ALMACÉN").toUpperCase()}`,
      meta: [
        ["FECHA", fechaHoyDoc()],
        ["ALMACÉN", nombre ?? ""],
        ["PRODUCTOS", String(filas.length)],
      ],
      filas,
      auto,
    });
    return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err) {
    console.error("[/api/inventario/reportes/almacenes/[id]/imprimir]", err instanceof Error ? err.message : err);
    return new NextResponse("No se pudo generar el reporte", { status: 500 });
  }
}
