import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Reporte "Inventario extendido" (Living Room / muebles).
 * Trae por producto los datos históricos que antes vivían en la ficha:
 * cantidad de importación, vendido, show room y exportación a Bolivia, más el
 * stock físico actual. El SALDO se calcula = importación − vendido − exportación Bolivia
 * (igual que el Excel original; NO resta show room).
 */
export interface ExtendidoRow {
  sku: string;
  nombre: string;
  nombre_importacion: string | null;
  cantidad_importacion: number;
  vendido: number;
  show_room: number;
  exportacion_bolivia: number;
  stock_actual: number;
  saldo: number;
}

export interface ExtendidoFilters {
  buscar?: string;
}

export interface ExtendidoTotals {
  productos: number;
  cantidad_importacion: number;
  vendido: number;
  show_room: number;
  exportacion_bolivia: number;
  stock_actual: number;
  saldo: number;
}

interface RawRow {
  sku: string;
  nombre: string;
  nombre_importacion: string | null;
  cantidad_importacion: string | number | null;
  vendido: string | number | null;
  show_room: string | number | null;
  exportacion_bolivia: string | number | null;
  stock_actual: string | number | null;
}

const n = (v: string | number | null | undefined) => Number(v ?? 0) || 0;

export async function listExtendido(
  schemaRaw: string,
  empresaId: string,
  filters: ExtendidoFilters = {}
): Promise<ExtendidoRow[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool no disponible.");
  const tP = quoteSchemaTable(schema, "productos");

  const params: unknown[] = [empresaId];
  let whereBuscar = "";
  const buscar = (filters.buscar ?? "").trim();
  if (buscar) {
    params.push(`%${buscar}%`);
    whereBuscar = ` AND (p.nombre ILIKE $${params.length} OR p.sku ILIKE $${params.length})`;
  }

  const { rows } = await pool.query<RawRow>(
    `SELECT p.sku, p.nombre, p.nombre_importacion,
            p.cantidad_importacion, p.vendido, p.show_room, p.exportacion_bolivia,
            p.stock_actual
       FROM ${tP} p
      WHERE p.empresa_id = $1::uuid AND p.activo IS NOT FALSE${whereBuscar}
      ORDER BY p.nombre`,
    params
  );

  return rows.map((r) => {
    const imp = n(r.cantidad_importacion);
    const vend = n(r.vendido);
    const eb = n(r.exportacion_bolivia);
    return {
      sku: r.sku,
      nombre: r.nombre,
      nombre_importacion: r.nombre_importacion,
      cantidad_importacion: imp,
      vendido: vend,
      show_room: n(r.show_room),
      exportacion_bolivia: eb,
      stock_actual: n(r.stock_actual),
      saldo: imp - vend - eb,
    };
  });
}

export function computeTotalsExtendido(rows: ExtendidoRow[]): ExtendidoTotals {
  return rows.reduce<ExtendidoTotals>(
    (acc, r) => {
      acc.productos += 1;
      acc.cantidad_importacion += r.cantidad_importacion;
      acc.vendido += r.vendido;
      acc.show_room += r.show_room;
      acc.exportacion_bolivia += r.exportacion_bolivia;
      acc.stock_actual += r.stock_actual;
      acc.saldo += r.saldo;
      return acc;
    },
    { productos: 0, cantidad_importacion: 0, vendido: 0, show_room: 0, exportacion_bolivia: 0, stock_actual: 0, saldo: 0 }
  );
}
