import { NextRequest } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { buildXlsxBuffer, xlsxResponseHeaders, nowStamp } from "@/lib/excel/export";
import { listExtendido, type ExtendidoRow } from "@/lib/inventario/reportes/extendido-pg";

export const runtime = "nodejs";

/** GET /api/inventario/reportes/extendido/export — Excel del reporte de inventario extendido. */
export async function GET(request: NextRequest) {
  const auth = await getAuthWithRol(request);
  if (!auth) return new Response("No autenticado", { status: 401 });
  if (!isAdmin(auth)) return new Response("Solo administradores", { status: 403 });
  try {
    const tenant = await getTenantSupabaseFromAuth(request);
    if (!tenant) return new Response("No autenticado", { status: 401 });
    const empresaId = tenant.auth.empresa_id;
    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    const buscar = new URL(request.url).searchParams.get("buscar") || undefined;
    const rows = await listExtendido(schema, empresaId, { buscar });

    const buf = buildXlsxBuffer<ExtendidoRow>(rows, [
      { header: "SKU / CODIGO", value: (r) => r.sku, width: 18 },
      { header: "NOMBRE", value: (r) => r.nombre, width: 40 },
      { header: "NOMBRE_IMPORTACION", value: (r) => r.nombre_importacion ?? "", width: 36 },
      { header: "CANTIDAD_IMPORTACION", value: (r) => r.cantidad_importacion, width: 16 },
      { header: "VENDIDO", value: (r) => r.vendido, width: 12 },
      { header: "SHOW_ROOM", value: (r) => r.show_room, width: 12 },
      { header: "EXPORTACION_BOLIVIA", value: (r) => r.exportacion_bolivia, width: 16 },
      { header: "STOCK_ACTUAL", value: (r) => r.stock_actual, width: 12 },
      { header: "SALDO", value: (r) => r.saldo, width: 12 },
    ], { sheetName: "Inventario extendido" });

    return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders(`inventario-extendido-${nowStamp()}`) });
  } catch (err) {
    console.error("[/api/inventario/reportes/extendido/export]", err instanceof Error ? err.message : err);
    return new Response("No se pudo generar el Excel", { status: 500 });
  }
}
