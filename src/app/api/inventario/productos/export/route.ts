import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { buildXlsxBuffer, xlsxResponseHeaders, nowStamp } from "@/lib/excel/export";

/**
 * GET /api/inventario/productos/export — descarga .xlsx con todos los
 * productos activos del tenant + nombres de categoria/proveedor/ubicacion
 * principal (resueltos via LEFT JOIN).
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
              p.cantidad_importacion, p.show_room, p.exportacion_bolivia,
              p.observaciones, p.posible_solucion
         FROM ${tProd} p
         LEFT JOIN ${tCat}  c  ON c.id = p.categoria_principal_id
         LEFT JOIN ${tProv} pr ON pr.id = p.proveedor_principal_id
         LEFT JOIN ${tUbi}  u  ON u.id = p.ubicacion_principal_id
        WHERE p.empresa_id = $1::uuid
        ORDER BY p.nombre`,
      [empresaId]
    );

    const buf = buildXlsxBuffer<Row>(rows, [
      { header: "N°", value: (_r, i) => i + 1, width: 6 },
      { header: "ALMACEN", value: (r) => r.ubicacion_pais ?? r.ubicacion_nombre ?? "", width: 12 },
      { header: "DESCRIPCION", value: (r) => r.nombre, width: 38 },
      { header: "CODIGO", value: (r) => r.sku, width: 18 },
      { header: "CANTIDAD IMPORTACION", value: (r) => Number(r.cantidad_importacion ?? 0), width: 16 },
      { header: "CANTIDAD FISICO PY", value: (r) => Number(r.stock_actual ?? 0), width: 16 },
      {
        header: "VENDIDO",
        value: (r) => {
          const imp = Number(r.cantidad_importacion ?? 0);
          const sr = Number(r.show_room ?? 0);
          const eb = Number(r.exportacion_bolivia ?? 0);
          const st = Number(r.stock_actual ?? 0);
          const v = imp - st - sr - eb;
          return v > 0 ? v : 0;
        },
        width: 10,
      },
      { header: "SHOW ROOM", value: (r) => Number(r.show_room ?? 0), width: 10 },
      { header: "EXPORTACION BOLIVIA", value: (r) => Number(r.exportacion_bolivia ?? 0), width: 16 },
      {
        header: "SALDO FINAL",
        value: (r) => {
          const st = Number(r.stock_actual ?? 0);
          const sr = Number(r.show_room ?? 0);
          const eb = Number(r.exportacion_bolivia ?? 0);
          return st - sr - eb;
        },
        width: 12,
      },
      { header: "OBSERVACIONES", value: (r) => r.observaciones ?? "", width: 30 },
      { header: "POSIBLE SOLUCION", value: (r) => r.posible_solucion ?? "", width: 30 },
      { header: "CATEGORIA", value: (r) => r.categoria_nombre ?? "", width: 22 },
      { header: "PROVEEDOR PRINCIPAL", value: (r) => r.proveedor_nombre ?? "", width: 28 },
      { header: "UBICACION", value: (r) => r.ubicacion_nombre ? `${r.ubicacion_nombre}${r.ubicacion_tipo ? ` (${r.ubicacion_tipo})` : ""}` : "", width: 24 },
      { header: "UNIDAD MEDIDA", value: (r) => r.unidad_medida, width: 12 },
      { header: "COSTO PROMEDIO", value: (r) => Number(r.costo_promedio), width: 14 },
      { header: "PRECIO VENTA", value: (r) => Number(r.precio_venta), width: 14 },
      { header: "STOCK MINIMO", value: (r) => Number(r.stock_minimo), width: 12 },
      { header: "METODO VALUACION", value: (r) => r.metodo_valuacion, width: 10 },
    ], { sheetName: "Stock" });

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: xlsxResponseHeaders(`productos-${nowStamp()}`),
    });
  } catch (err) {
    console.error("[/api/inventario/productos/export]", err instanceof Error ? err.message : err);
    return new Response("No se pudo generar el Excel", { status: 500 });
  }
}
