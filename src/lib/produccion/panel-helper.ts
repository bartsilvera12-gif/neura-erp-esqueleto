import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { stockPorTipo } from "@/lib/produccion/inventario-helper";
import { CAUSA_ADICIONAL_LABEL } from "@/lib/produccion/ordenes-helper";

export type ProyectoPanel = {
  id: string; codigo: string; nombre: string; cliente_nombre: string | null; estado: string;
  fecha_entrega_prevista: string | null; responsable_produccion: string | null;
  costo_presupuestado: number; costo_real: number; ingreso_final: number; utilidad_real: number; margen_real: number | null; desviacion: number;
  retrasado: boolean;
};
export type InventarioPanel = { articulo_tipo: string; codigo: string; descripcion: string; unidad: string; fisico: number; reservado: number; disponible: number; stock_minimo: number | null; bajo: boolean };

export type DatosPanel = {
  proyectos: ProyectoPanel[];
  resumen_estados: Record<string, number>;
  retrasados: number;
  proximos: number; // vencen en los próximos 15 días
  inventario: InventarioPanel[];
  bajo_minimo: number;
  desviaciones_causa: { causa: string; label: string; monto: number }[];
};

const hoy = () => new Date().toISOString().slice(0, 10);
const enDias = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const ABIERTO = (e: string) => e !== "entregado" && e !== "cerrado" && e !== "cancelado";

/** Arma todos los datos del panel de control de producción (spec sección 10) en pocas consultas. */
export async function datosPanel(sb: AppSupabaseClient, emp: string): Promise<DatosPanel> {
  const [proyQ, presQ, ordQ, gasQ, ordLinQ, tabQ, herrQ, stTab, stHer] = await Promise.all([
    sb.from("prod_proyectos").select("id, codigo, nombre, cliente_nombre, estado, fecha_entrega_prevista, responsable_produccion, ingreso_final").eq("empresa_id", emp).order("created_at", { ascending: false }),
    sb.from("prod_presupuestos").select("proyecto_id, total, version").eq("empresa_id", emp).eq("estado", "aprobada"),
    sb.from("prod_contratista_ordenes").select("proyecto_id, importe_aprobado").eq("empresa_id", emp).eq("estado", "aprobada"),
    sb.from("prod_gastos").select("proyecto_id, monto, categoria").eq("empresa_id", emp),
    sb.from("prod_contratista_orden_lineas").select("causa, subtotal, tipo_partida").eq("empresa_id", emp).eq("tipo_partida", "adicional"),
    sb.from("prod_tableros").select("id, codigo, tipo, espesor_valor, espesor_unidad, color_acabado, unidad_compra").eq("empresa_id", emp).eq("activo", true),
    sb.from("prod_herrajes").select("id, codigo, descripcion, unidad, stock_minimo").eq("empresa_id", emp).eq("activo", true),
    stockPorTipo(sb, emp, "tablero"),
    stockPorTipo(sb, emp, "herraje"),
  ]);

  // Presupuesto aprobado por proyecto = el de mayor versión.
  const presByProy = new Map<string, { total: number; version: number }>();
  for (const r of (presQ.data ?? []) as { proyecto_id: string; total: number; version: number }[]) {
    const cur = presByProy.get(r.proyecto_id);
    if (!cur || r.version > cur.version) presByProy.set(r.proyecto_id, { total: Number(r.total) || 0, version: r.version });
  }
  const ordByProy = new Map<string, number>();
  for (const r of (ordQ.data ?? []) as { proyecto_id: string; importe_aprobado: number }[]) ordByProy.set(r.proyecto_id, (ordByProy.get(r.proyecto_id) ?? 0) + (Number(r.importe_aprobado) || 0));
  const gastoByProy = new Map<string, number>();
  for (const r of (gasQ.data ?? []) as { proyecto_id: string | null; monto: number; categoria: string }[]) {
    if (!r.proyecto_id || r.categoria === "contratista") continue;
    gastoByProy.set(r.proyecto_id, (gastoByProy.get(r.proyecto_id) ?? 0) + (Number(r.monto) || 0));
  }

  const hoyS = hoy(), limite = enDias(15);
  const resumen: Record<string, number> = {};
  let retrasados = 0, proximos = 0;
  const proyectos: ProyectoPanel[] = [];
  for (const p of (proyQ.data ?? []) as Record<string, unknown>[]) {
    const id = String(p.id), estado = String(p.estado);
    resumen[estado] = (resumen[estado] ?? 0) + 1;
    const contratista = ordByProy.get(id) ?? 0;
    const costoPres = (presByProy.get(id)?.total ?? 0) + contratista;
    const costoReal = (gastoByProy.get(id) ?? 0) + contratista;
    const ingreso = Number(p.ingreso_final) || 0;
    const utilidad = ingreso - costoReal;
    const margen = ingreso > 0 ? Math.round((utilidad / ingreso) * 1000) / 10 : null;
    const fprev = p.fecha_entrega_prevista ? String(p.fecha_entrega_prevista).slice(0, 10) : null;
    const retrasado = !!fprev && ABIERTO(estado) && fprev < hoyS;
    if (retrasado) retrasados++;
    else if (fprev && ABIERTO(estado) && fprev <= limite) proximos++;
    proyectos.push({
      id, codigo: String(p.codigo), nombre: String(p.nombre), cliente_nombre: (p.cliente_nombre as string) ?? null, estado,
      fecha_entrega_prevista: fprev, responsable_produccion: (p.responsable_produccion as string) ?? null,
      costo_presupuestado: costoPres, costo_real: costoReal, ingreso_final: ingreso, utilidad_real: utilidad, margen_real: margen,
      desviacion: costoReal - costoPres, retrasado,
    });
  }

  // Inventario
  const vacio = { fisico: 0, utilizable: 0, reservado: 0, disponible: 0 };
  const inventario: InventarioPanel[] = [];
  for (const t of (tabQ.data ?? []) as Record<string, unknown>[]) {
    const id = String(t.id); const s = stTab[id] ?? vacio;
    const esp = t.espesor_valor ? ` ${t.espesor_valor}${t.espesor_unidad ?? "mm"}` : "";
    inventario.push({ articulo_tipo: "tablero", codigo: String(t.codigo), descripcion: `${t.tipo ?? ""}${esp}${t.color_acabado ? " · " + t.color_acabado : ""}`.trim(), unidad: String(t.unidad_compra ?? "PLANCHA"), fisico: s.fisico, reservado: s.reservado, disponible: s.disponible, stock_minimo: null, bajo: false });
  }
  let bajoMin = 0;
  for (const h of (herrQ.data ?? []) as Record<string, unknown>[]) {
    const id = String(h.id); const s = stHer[id] ?? vacio;
    const min = h.stock_minimo == null ? null : Number(h.stock_minimo);
    const bajo = min != null && s.disponible < min; if (bajo) bajoMin++;
    inventario.push({ articulo_tipo: "herraje", codigo: String(h.codigo), descripcion: String(h.descripcion ?? ""), unidad: String(h.unidad ?? "UNIDAD"), fisico: s.fisico, reservado: s.reservado, disponible: s.disponible, stock_minimo: min, bajo });
  }

  // Desviaciones por causa (adicionales de contratista)
  const causaMap = new Map<string, number>();
  for (const l of (ordLinQ.data ?? []) as { causa: string | null; subtotal: number }[]) {
    const k = l.causa ?? "otra"; causaMap.set(k, (causaMap.get(k) ?? 0) + (Number(l.subtotal) || 0));
  }
  const desviaciones_causa = [...causaMap.entries()].map(([causa, monto]) => ({ causa, label: CAUSA_ADICIONAL_LABEL[causa] ?? causa, monto })).sort((a, b) => b.monto - a.monto);

  return { proyectos, resumen_estados: resumen, retrasados, proximos, inventario, bajo_minimo: bajoMin, desviaciones_causa };
}
