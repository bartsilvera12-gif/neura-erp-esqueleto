import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Cuentas por Pagar — deuda con proveedores originada en COMPRAS a crédito.
 * Solo lectura. Como todavía no hay módulo de pagos a proveedores, el saldo
 * pendiente es el total de cada compra (no hay pagos parciales que descontar).
 *
 * Vencimiento = fecha de la compra + plazo (días).
 *
 * ADAPTADO al modelo de datos de esta instancia: `compras` es PLANA (una fila por
 * línea de producto) y el comprobante es el conjunto de filas que comparten
 * `numero_control`. Por eso se agrupa por `numero_control` y se suman los totales,
 * en vez de tratar cada fila como una compra independiente.
 *
 * Columnas que no existen acá y se resuelven de otra forma:
 *   · `tipo_comprobante`   -> siempre 'Factura' (toda compra con timbrado lo es).
 *   · `numero_comprobante` -> se usa `numero_factura`, con fallback a `numero_control`.
 *   · `cuotas`             -> no existe el pago en cuotas; siempre 1, y la cuota
 *                             estimada coincide con el total del comprobante.
 */

export interface CuentaPagarRow {
  compra_id: string;
  numero_control: string;
  fecha: string | null;
  fecha_vencimiento: string | null;
  proveedor_id: string | null;
  proveedor: string | null;
  ruc: string | null;
  tipo_comprobante: string | null;
  numero_comprobante: string | null;
  timbrado: string | null;
  plazo_dias: number | null;
  cuotas: number;
  total: string | number;
  monto_cuota: string | number;
  vencida: boolean;
  dias_para_vencer: number | null;
}

export interface CuentaPagarTotals {
  cantidad: number;
  total: number;
  vencido: number;
  por_vencer: number;
}

export interface CuentasPagarFilters {
  desde?: string | null;
  hasta?: string | null;
  proveedor_id?: string | null;
  /** 'vencidas' | 'por_vencer' | null */
  estado?: string | null;
}

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

export async function listCuentasPorPagar(
  schemaRaw: string,
  empresaId: string,
  f: CuentasPagarFilters = {}
): Promise<CuentaPagarRow[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tC = quoteSchemaTable(schema, "compras");
  const tPr = quoteSchemaTable(schema, "proveedores");

  const params: unknown[] = [empresaId];
  const where: string[] = [
    "c.empresa_id = $1::uuid",
    "c.tipo_pago = 'credito'",
    "COALESCE(c.estado,'') <> 'anulada'",
  ];
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (f.desde) where.push(`c.fecha::date >= ${add(f.desde)}::date`);
  if (f.hasta) where.push(`c.fecha::date <= ${add(f.hasta)}::date`);
  if (f.proveedor_id) where.push(`c.proveedor_id = ${add(f.proveedor_id)}::uuid`);

  // Vencimiento = fecha + plazo (0 si no hay plazo). Estado por comparación con hoy.
  const sql = `
    SELECT MIN(c.id::text)::uuid AS compra_id,
           c.numero_control,
           c.fecha::date AS fecha,
           (c.fecha::date + COALESCE(MIN(c.plazo_dias), 0)) AS fecha_vencimiento,
           MIN(c.proveedor_id::text)::uuid AS proveedor_id,
           MIN(COALESCE(c.proveedor_nombre, pr.nombre)) AS proveedor,
           MIN(pr.ruc) AS ruc,
           'Factura'::text AS tipo_comprobante,
           COALESCE(NULLIF(MIN(c.numero_factura), ''), c.numero_control) AS numero_comprobante,
           MIN(c.nro_timbrado) AS timbrado,
           MIN(c.plazo_dias) AS plazo_dias,
           1 AS cuotas,
           COALESCE(SUM(c.total), 0) AS total,
           round(COALESCE(SUM(c.total), 0)) AS monto_cuota,
           ((c.fecha::date + COALESCE(MIN(c.plazo_dias), 0)) < current_date) AS vencida,
           ((c.fecha::date + COALESCE(MIN(c.plazo_dias), 0)) - current_date) AS dias_para_vencer
      FROM ${tC} c
      LEFT JOIN ${tPr} pr ON pr.id = c.proveedor_id
     WHERE ${where.join(" AND ")}
     GROUP BY c.numero_control, c.fecha::date
     ORDER BY (c.fecha::date + COALESCE(MIN(c.plazo_dias), 0)) ASC, c.numero_control ASC`;

  const { rows } = await pool().query<CuentaPagarRow>(sql, params);

  // Filtro por estado (vencidas / por vencer) en JS para no complicar el SQL.
  if (f.estado === "vencidas") return rows.filter((r) => r.vencida);
  if (f.estado === "por_vencer") return rows.filter((r) => !r.vencida);
  return rows;
}

export function computeTotals(rows: CuentaPagarRow[]): CuentaPagarTotals {
  const t: CuentaPagarTotals = { cantidad: rows.length, total: 0, vencido: 0, por_vencer: 0 };
  for (const r of rows) {
    const v = Number(r.total) || 0;
    t.total += v;
    if (r.vencida) t.vencido += v; else t.por_vencer += v;
  }
  return t;
}
