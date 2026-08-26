import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Libro de Compras — comprobantes de compra con su desglose de IVA.
 *
 * ADAPTADO al modelo de datos de esta instancia. En el ERP de donde se portó este
 * reporte, `compras` es una cabecera con una tabla hija `compra_items`, y `gastos`
 * tiene datos fiscales propios (proveedor, timbrado, tipo de comprobante, ítems).
 * Acá el modelo es distinto:
 *
 *   · `compras` es PLANA: una fila por línea de producto, y el comprobante es el
 *     conjunto de filas que comparten `numero_control`. Por eso se agrupa por
 *     `numero_control` y se suma el IVA de las líneas, en vez de hacer join con
 *     `compra_items` (que no existe).
 *   · `gastos` es una tabla simple (categoría, descripción, monto, fecha) sin
 *     proveedor, timbrado ni ítems. No hay datos fiscales que llevar al libro,
 *     así que la mitad "Gastos y Servicios" del reporte original queda fuera.
 *     El filtro `origen` se conserva en la firma por compatibilidad, pero solo
 *     devuelve resultados para 'compra'.
 *
 * Solo lectura: no crea asientos ni toca inventario.
 * Excluye compras anuladas y las que no tienen timbrado (no son fiscales).
 */

export interface LibroCompraRow {
  origen_tipo: "compra" | "gasto";
  origen: string;
  fecha: string | null;
  proveedor: string | null;
  ruc: string | null;
  tipo_comprobante: string | null;
  timbrado: string | null;
  numero: string | null;
  condicion: string | null;
  exento: string | number;
  gravado5: string | number;
  iva5: string | number;
  gravado10: string | number;
  iva10: string | number;
  total: string | number;
  estado: string;
  proveedor_id: string | null;
}

export interface LibroTotals {
  exento: number;
  gravado5: number;
  iva5: number;
  gravado10: number;
  iva10: number;
  total: number;
  cantidad: number;
}

export interface LibroFilters {
  desde?: string | null;
  hasta?: string | null;
  proveedor_id?: string | null;
  origen?: "compra" | "gasto" | null;
  tipo_comprobante?: string | null;
  condicion?: string | null;
}

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

export async function listLibroCompras(
  schemaRaw: string,
  empresaId: string,
  f: LibroFilters = {}
): Promise<LibroCompraRow[]> {
  // `gastos` no tiene datos fiscales en esta instancia: no hay nada que listar.
  if (f.origen === "gasto") return [];

  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tC = quoteSchemaTable(schema, "compras");
  const tPr = quoteSchemaTable(schema, "proveedores");

  const params: unknown[] = [empresaId];
  const outer: string[] = [];
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };

  if (f.desde) outer.push(`x.fecha >= ${add(f.desde)}::date`);
  if (f.hasta) outer.push(`x.fecha <= ${add(f.hasta)}::date`);
  if (f.proveedor_id) outer.push(`x.proveedor_id = ${add(f.proveedor_id)}::uuid`);
  if (f.condicion) outer.push(`x.condicion = ${add(f.condicion)}`);
  // `tipo_comprobante` no existe como columna: todo comprobante de compra con
  // timbrado se informa como Factura. El filtro solo puede coincidir con eso.
  if (f.tipo_comprobante) outer.push(`x.tipo_comprobante = ${add(f.tipo_comprobante)}`);
  const outerWhere = outer.length ? `WHERE ${outer.join(" AND ")}` : "";

  const sql = `
    WITH unificado AS (
      SELECT 'compra'::text AS origen_tipo,
             'Compra'::text AS origen,
             c.fecha::date   AS fecha,
             MIN(COALESCE(c.proveedor_nombre, pr.nombre)) AS proveedor,
             MIN(pr.ruc)     AS ruc,
             'Factura'::text AS tipo_comprobante,
             c.nro_timbrado  AS timbrado,
             COALESCE(NULLIF(MIN(c.numero_factura), ''), c.numero_control) AS numero,
             MIN(c.tipo_pago) AS condicion,
             -- Desglose de IVA sumando las líneas del mismo comprobante.
             COALESCE(SUM(CASE WHEN c.iva_tipo = 'exenta' THEN c.subtotal  ELSE 0 END), 0) AS exento,
             COALESCE(SUM(CASE WHEN c.iva_tipo = '5'      THEN c.subtotal  ELSE 0 END), 0) AS gravado5,
             COALESCE(SUM(CASE WHEN c.iva_tipo = '5'      THEN c.monto_iva ELSE 0 END), 0) AS iva5,
             COALESCE(SUM(CASE WHEN c.iva_tipo = '10'     THEN c.subtotal  ELSE 0 END), 0) AS gravado10,
             COALESCE(SUM(CASE WHEN c.iva_tipo = '10'     THEN c.monto_iva ELSE 0 END), 0) AS iva10,
             COALESCE(SUM(c.total), 0) AS total,
             MIN(COALESCE(c.estado, '')) AS estado,
             MIN(c.proveedor_id::text)::uuid AS proveedor_id
        FROM ${tC} c
        LEFT JOIN ${tPr} pr ON pr.id = c.proveedor_id
       WHERE c.empresa_id = $1::uuid
         AND COALESCE(c.estado, '') <> 'anulada'
         AND c.nro_timbrado IS NOT NULL
         AND btrim(c.nro_timbrado) <> ''
       GROUP BY c.numero_control, c.fecha::date, c.nro_timbrado
    )
    SELECT x.* FROM unificado x
    ${outerWhere}
    ORDER BY x.fecha DESC NULLS LAST, x.numero DESC`;

  const { rows } = await pool().query<LibroCompraRow>(sql, params);
  return rows;
}

export function computeTotals(rows: LibroCompraRow[]): LibroTotals {
  const t: LibroTotals = { exento: 0, gravado5: 0, iva5: 0, gravado10: 0, iva10: 0, total: 0, cantidad: rows.length };
  for (const r of rows) {
    t.exento += Number(r.exento) || 0;
    t.gravado5 += Number(r.gravado5) || 0;
    t.iva5 += Number(r.iva5) || 0;
    t.gravado10 += Number(r.gravado10) || 0;
    t.iva10 += Number(r.iva10) || 0;
    t.total += Number(r.total) || 0;
  }
  return t;
}
