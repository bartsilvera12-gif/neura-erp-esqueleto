import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { buildXlsxBuffer, xlsxResponseHeaders, nowStamp } from "@/lib/excel/export";

/**
 * GET /api/inventario/productos/export — .xlsx con las 12 columnas del Excel
 * de inventario de Living Room ("INVENTARIO DE STOCK ASUNCION PARAGUAY").
 */
interface Row {
  nombre: string;
  sku: string;
  codigo_barras: string | null;
  codigo_barras_interno: boolean;
  categoria_nombre: string | null;
  proveedor_nombre: string | null;
  ubicacion_nombre: string | null;
  ubicacion_tipo: string | null;
  unidad_medida: string;
  costo_promedio: string | number;
  precio_venta: string | number;
  stock_actual: string | number;
  stock_minimo: string | number;
  metodo_valuacion: string;
  activo: boolean;
  ubicacion_pais: string | null;
  cantidad_importacion: string | number | null;
  vendido: string | number | null;
  show_room: string | number | null;
  exportacion_bolivia: string | number | null;
  observaciones: string | null;
  posible_solucion: string | null;
}

export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const empresaId = ctx.auth.empresa_id;
  const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
  const pool = getChatPostgresPool();
  if (!pool) return new Response("Pool no disponible", { status: 500 });

  const tProd = quoteSchemaTable(schema, "productos");
  const tCat = quoteSchemaTable(schema, "categorias_productos");
  const tProv = quoteSchemaTable(schema, "proveedores");
  const tUbi = quoteSchemaTable(schema, "inventario_ubicaciones");

  try {
    const { rows } = await pool.query<Row>(
      `SELECT p.nombre, p.sku, p.codigo_barras, p.codigo_barras_interno,
              c.nombre AS categoria_nombre,
              pr.nombre AS proveedor_nombre,
              u.nombre AS ubicacion_nombre, u.tipo AS ubicacion_tipo, u.pais AS ubicacion_pais,
              p.unidad_medida, p.costo_promedio, p.precio_venta,
              p.stock_actual, p.stock_minimo, p.metodo_valuacion, p.activo,
              p.cantidad_importacion, p.vendido, p.show_room, p.exportacion_bolivia,
              p.observaciones, p.posible_solucion
         FROM ${tProd} p
         LEFT JOIN ${tCat}  c  ON c.id = p.categoria_principal_id
         LEFT JOIN ${tProv} pr ON pr.id = p.proveedor_principal_id
         LEFT JOIN ${tUbi}  u  ON u.id = p.ubicacion_principal_id
        WHERE p.empresa_id = $1::uuid AND p.activo IS NOT FALSE
        ORDER BY p.nombre`,
      [empresaId]
    );

    // Columnas alineadas al IMPORTADOR de productos: así el archivo exportado
    // se puede volver a subir sin errores (export ↔ import round-trip).
    const buf = buildXlsxBuffer<Row>(rows, [
      { header: "NOMBRE", value: (r) => r.nombre, width: 38 },
      { header: "SKU", value: (r) => r.sku, width: 18 },
      // Si el código es interno (INT-...), se exporta vacío: el importador lo
      // rechaza por ser prefijo reservado y lo regenera solo.
      { header: "CODIGO_BARRAS", value: (r) => (r.codigo_barras_interno ? "" : r.codigo_barras ?? ""), width: 18 },
      { header: "CATEGORIA", value: (r) => r.categoria_nombre ?? "", width: 18 },
      { header: "PROVEEDOR_PRINCIPAL", value: (r) => r.proveedor_nombre ?? "", width: 20 },
      { header: "UBICACION_PRINCIPAL", value: (r) => r.ubicacion_nombre ?? "", width: 20 },
      { header: "UNIDAD_MEDIDA", value: (r) => r.unidad_medida || "UNIDAD", width: 14 },
      { header: "COSTO_PROMEDIO", value: (r) => Number(r.costo_promedio ?? 0), width: 14 },
      { header: "PRECIO_VENTA", value: (r) => Number(r.precio_venta ?? 0), width: 14 },
      { header: "STOCK_ACTUAL", value: (r) => Number(r.stock_actual ?? 0), width: 12 },
      { header: "STOCK_MINIMO", value: (r) => Number(r.stock_minimo ?? 0), width: 12 },
      { header: "METODO_VALUACION", value: (r) => r.metodo_valuacion || "CPP", width: 16 },
      { header: "ACTIVO", value: (r) => (r.activo ? "SI" : "NO"), width: 8 },
      // Vacío a propósito: al re-importar no toca la imagen ya guardada.
      { header: "IMAGEN_URL", value: () => "", width: 40 },
    ], { sheetName: "Productos" });

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: xlsxResponseHeaders(`productos-${nowStamp()}`),
    });
  } catch (err) {
    console.error("[/api/inventario/productos/export]", err instanceof Error ? err.message : err);
    return new Response("No se pudo generar el Excel", { status: 500 });
  }
}
