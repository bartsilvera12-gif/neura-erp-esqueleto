import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Reporte por almacén (depósito). Por cada depósito activo:
 *  - fisico:   stock actual en ese depósito (inventario_stock_ubicacion).
 *  - productos: cantidad de productos con stock distinto de 0 en ese depósito.
 *  - entradas: movimientos ENTRADA cuyo destino es ese depósito (en el rango).
 *  - salidas:  movimientos SALIDA cuyo origen es ese depósito (en el rango).
 *  - vendido:  salidas con origen='venta' desde ese depósito (en el rango).
 * El físico es al momento (no depende del rango); entradas/salidas/vendido sí.
 */
export interface AlmacenRow {
  ubicacion_id: string | null;
  nombre: string;
  codigo: string | null;
  fisico: number;
  productos: number;
  entradas: number;
  salidas: number;
  vendido: number;
}

export interface AlmacenesFilters {
  desde?: string;
  hasta?: string;
}

const n = (v: unknown) => Number(v ?? 0) || 0;

export async function listAlmacenes(
  schemaRaw: string,
  empresaId: string,
  filters: AlmacenesFilters = {}
): Promise<AlmacenRow[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool no disponible.");
  const tU = quoteSchemaTable(schema, "inventario_ubicaciones");
  const tS = quoteSchemaTable(schema, "inventario_stock_ubicacion");
  const tM = quoteSchemaTable(schema, "movimientos_inventario");

  // Rango de fechas opcional para los movimientos.
  const movParams: unknown[] = [empresaId];
  let rango = "";
  if (filters.desde) { movParams.push(filters.desde); rango += ` AND fecha >= $${movParams.length}::date`; }
  if (filters.hasta) { movParams.push(filters.hasta); rango += ` AND fecha < ($${movParams.length}::date + 1)`; }

  const [ubis, fisico, entradas, salidas] = await Promise.all([
    pool.query<{ id: string; nombre: string; codigo: string | null }>(
      `SELECT id, nombre, codigo FROM ${tU} WHERE empresa_id=$1::uuid AND activo=true ORDER BY nombre`,
      [empresaId]
    ),
    pool.query<{ ubicacion_id: string; fisico: string; productos: string }>(
      `SELECT ubicacion_id, SUM(stock_actual) AS fisico,
              COUNT(*) FILTER (WHERE stock_actual <> 0) AS productos
         FROM ${tS} WHERE empresa_id=$1::uuid GROUP BY ubicacion_id`,
      [empresaId]
    ),
    pool.query<{ ubic: string; entradas: string }>(
      `SELECT ubicacion_destino_id AS ubic, SUM(cantidad) AS entradas
         FROM ${tM}
        WHERE empresa_id=$1::uuid AND tipo='ENTRADA' AND ubicacion_destino_id IS NOT NULL${rango}
        GROUP BY ubicacion_destino_id`,
      movParams
    ),
    pool.query<{ ubic: string; salidas: string; vendido: string }>(
      `SELECT ubicacion_origen_id AS ubic, SUM(cantidad) AS salidas,
              SUM(cantidad) FILTER (WHERE origen='venta') AS vendido
         FROM ${tM}
        WHERE empresa_id=$1::uuid AND tipo='SALIDA' AND ubicacion_origen_id IS NOT NULL${rango}
        GROUP BY ubicacion_origen_id`,
      movParams
    ),
  ]);

  const fisicoById = new Map(fisico.rows.map((r) => [r.ubicacion_id, r]));
  const entradasById = new Map(entradas.rows.map((r) => [r.ubic, r]));
  const salidasById = new Map(salidas.rows.map((r) => [r.ubic, r]));

  return ubis.rows.map((u) => {
    const f = fisicoById.get(u.id);
    const e = entradasById.get(u.id);
    const s = salidasById.get(u.id);
    return {
      ubicacion_id: u.id,
      nombre: u.nombre,
      codigo: u.codigo,
      fisico: n(f?.fisico),
      productos: n(f?.productos),
      entradas: n(e?.entradas),
      salidas: n(s?.salidas),
      vendido: n(s?.vendido),
    };
  });
}

export function totalAlmacenes(rows: AlmacenRow[]): AlmacenRow {
  return rows.reduce<AlmacenRow>(
    (acc, r) => {
      acc.fisico += r.fisico;
      acc.productos += r.productos;
      acc.entradas += r.entradas;
      acc.salidas += r.salidas;
      acc.vendido += r.vendido;
      return acc;
    },
    { ubicacion_id: null, nombre: "TOTAL GENERAL", codigo: null, fisico: 0, productos: 0, entradas: 0, salidas: 0, vendido: 0 }
  );
}
