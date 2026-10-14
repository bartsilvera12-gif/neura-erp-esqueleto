import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { listExtendido } from "@/lib/inventario/reportes/extendido-pg";
import { conteoFisicoHtml, fechaHoyDoc } from "@/lib/inventario/reportes/conteo-pdf";

export const runtime = "nodejs";

/**
 * GET /api/inventario/reportes/extendido/imprimir?buscar=&auto=1
 * Hoja de conteo físico (PDF) de todos los productos del inventario.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return new NextResponse("No autenticado", { status: 401 });
  if (!isAdmin(auth)) return new NextResponse("Solo administradores", { status: 403 });
  try {
    const tenant = await getTenantSupabaseFromAuth(request);
    if (!tenant) return new NextResponse("No autenticado", { status: 401 });
    const empresaId = tenant.auth.empresa_id;
    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    const url = new URL(request.url);
    const buscar = url.searchParams.get("buscar") || undefined;
    const auto = url.searchParams.get("auto") === "1";
    const rows = await listExtendido(schema, empresaId, { buscar });

    const html = conteoFisicoHtml({
      titulo: "CONTEO FÍSICO DE INVENTARIO",
      meta: [
        ["FECHA", fechaHoyDoc()],
        ["PRODUCTOS", String(rows.length)],
      ],
      filas: rows.map((r) => ({ sku: r.sku, nombre: r.nombre, stock: r.stock_actual })),
      auto,
    });
    return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err) {
    console.error("[/api/inventario/reportes/extendido/imprimir]", err instanceof Error ? err.message : err);
    return new NextResponse("No se pudo generar el reporte", { status: 500 });
  }
}
