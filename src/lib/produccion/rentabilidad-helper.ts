import type { AppSupabaseClient } from "@/lib/supabase/schema";

export type Rentabilidad = {
  ingreso: { precio_venta: number; descuento_venta: number; ingreso_previsto: number; ingreso_final: number };
  costo_presupuestado: { materiales: number; contratista: number; total: number };
  costo_real: { gastos: number; contratista: number; total: number; gastos_total: number };
  utilidad_estimada: number; utilidad_real: number; margen_real: number | null; desviacion_costo: number;
  alertas: { gastos_sin_comprobante: number };
};

/**
 * Calcula costos y rentabilidad del proyecto (spec 5.9).
 *   costo presupuestado = presupuesto aprobado (materiales) + cotizaciones de contratista aprobadas
 *   costo real          = gastos imputados (sin categoría contratista) + cotizaciones aprobadas
 *   margen real %       = utilidad real / ingreso final × 100  (si ingreso=0 → null = "No calculable", RB-010)
 */
export async function computeRentabilidad(sb: AppSupabaseClient, emp: string, proyectoId: string): Promise<Rentabilidad | null> {
  const pq = await sb.from("prod_proyectos").select("precio_venta, descuento_venta, ingreso_final").eq("empresa_id", emp).eq("id", proyectoId).maybeSingle();
  if (pq.error || !pq.data) return null;
  const proy = pq.data as { precio_venta: number; descuento_venta: number; ingreso_final: number };

  const [presAprob, ordenes, gastos] = await Promise.all([
    sb.from("prod_presupuestos").select("total").eq("empresa_id", emp).eq("proyecto_id", proyectoId).eq("estado", "aprobada").order("version", { ascending: false }).limit(1),
    sb.from("prod_contratista_ordenes").select("importe_aprobado").eq("empresa_id", emp).eq("proyecto_id", proyectoId).eq("estado", "aprobada"),
    sb.from("prod_gastos").select("monto, categoria, tiene_comprobante").eq("empresa_id", emp).eq("proyecto_id", proyectoId),
  ]);

  const presupuestoMateriales = Number((presAprob.data?.[0] as { total?: number } | undefined)?.total ?? 0);
  const contratistaAprobado = ((ordenes.data ?? []) as { importe_aprobado: number | null }[]).reduce((a, r) => a + (Number(r.importe_aprobado) || 0), 0);
  const gastosRows = (gastos.data ?? []) as { monto: number; categoria: string; tiene_comprobante: boolean }[];
  const gastosNoContratista = gastosRows.filter((g) => g.categoria !== "contratista").reduce((a, g) => a + (Number(g.monto) || 0), 0);
  const gastosTotal = gastosRows.reduce((a, g) => a + (Number(g.monto) || 0), 0);
  const gastosSinComprobante = gastosRows.filter((g) => !g.tiene_comprobante).length;

  const costoPresupuestado = presupuestoMateriales + contratistaAprobado;
  const costoReal = gastosNoContratista + contratistaAprobado;
  const ingresoPrevisto = (Number(proy.precio_venta) || 0) - (Number(proy.descuento_venta) || 0);
  const ingresoFinal = Number(proy.ingreso_final) || 0;
  const utilidadEstimada = ingresoPrevisto - costoPresupuestado;
  const utilidadReal = ingresoFinal - costoReal;
  const margenReal = ingresoFinal > 0 ? Math.round((utilidadReal / ingresoFinal) * 1000) / 10 : null;

  return {
    ingreso: { precio_venta: Number(proy.precio_venta) || 0, descuento_venta: Number(proy.descuento_venta) || 0, ingreso_previsto: ingresoPrevisto, ingreso_final: ingresoFinal },
    costo_presupuestado: { materiales: presupuestoMateriales, contratista: contratistaAprobado, total: costoPresupuestado },
    costo_real: { gastos: gastosNoContratista, contratista: contratistaAprobado, total: costoReal, gastos_total: gastosTotal },
    utilidad_estimada: utilidadEstimada, utilidad_real: utilidadReal, margen_real: margenReal, desviacion_costo: costoReal - costoPresupuestado,
    alertas: { gastos_sin_comprobante: gastosSinComprobante },
  };
}

/** Lista pendientes que bloquean el cierre (spec 5.10, flujo 9.3). */
export async function pendientesCierre(sb: AppSupabaseClient, emp: string, proyectoId: string): Promise<string[]> {
  const pend: string[] = [];
  const [notasBorrador, ordenesBorrador, gastosSinComp, rent] = await Promise.all([
    sb.from("prod_notas_entrega").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("proyecto_id", proyectoId).eq("estado", "borrador"),
    sb.from("prod_contratista_ordenes").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("proyecto_id", proyectoId).eq("estado", "borrador"),
    sb.from("prod_gastos").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("proyecto_id", proyectoId).eq("tiene_comprobante", false),
    computeRentabilidad(sb, emp, proyectoId),
  ]);
  if ((notasBorrador.count ?? 0) > 0) pend.push(`Hay ${notasBorrador.count} nota(s) de entrega sin confirmar.`);
  if ((ordenesBorrador.count ?? 0) > 0) pend.push(`Hay ${ordenesBorrador.count} cotización(es) de contratista en borrador.`);
  if ((gastosSinComp.count ?? 0) > 0) pend.push(`Hay ${gastosSinComp.count} gasto(s) sin comprobante.`);
  if (rent && rent.ingreso.ingreso_final <= 0) pend.push("Falta cargar el ingreso final (facturado) del proyecto.");
  return pend;
}
