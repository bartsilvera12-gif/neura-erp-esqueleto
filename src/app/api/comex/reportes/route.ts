import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, hoyPY } from "@/lib/comex/server";

const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const contar = <T,>(xs: T[], k: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(k(x), (m.get(k(x)) ?? 0) + 1);
  return [...m.entries()].map(([clave, cantidad]) => ({ clave, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
};

/**
 * GET ?desde=&hasta= — reportes de Comercio Exterior (PDF §9): operaciones,
 * inventario físico, proveedores y QA. Todo se calcula de los registros.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sp = new URL(request.url).searchParams;
    const hoy = hoyPY();
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("desde") ?? "") ? (sp.get("desde") as string) : `${hoy.slice(0, 4)}-01-01`;
    const hasta = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("hasta") ?? "") ? (sp.get("hasta") as string) : hoy;
    const hastaTs = `${hasta}T23:59:59`;

    const [imps, exps, conts, conteos, compr, incs] = await Promise.all([
      ctx.supabase.from("importaciones").select("id, numero, estado, proveedor_nombre, created_at").eq("empresa_id", emp).gte("created_at", desde).lte("created_at", hastaTs),
      ctx.supabase.from("exportaciones").select("id, numero, estado, cliente_nombre, fecha_comprometida_embarque, fecha_embarque, created_at").eq("empresa_id", emp).gte("created_at", desde).lte("created_at", hastaTs),
      ctx.supabase.from("comex_contenedores").select("estado, tipo_operacion").eq("empresa_id", emp),
      ctx.supabase.from("inventario_conteos").select("id, numero, estado, ubicacion_nombre, created_at").eq("empresa_id", emp).gte("created_at", desde).lte("created_at", hastaTs),
      ctx.supabase.from("proveedor_compromisos").select("proveedor_nombre, fecha_comprometida, fecha_real, estado, documentacion_completa").eq("empresa_id", emp).gte("fecha_comprometida", desde).lte("fecha_comprometida", hasta),
      ctx.supabase.from("comex_incidencias").select("id, origen_tipo, origen_id, tipo, estado, prioridad, created_at, resuelto_at, fecha_limite").eq("empresa_id", emp).gte("created_at", desde).lte("created_at", hastaTs),
    ]);
    const err = imps.error ?? exps.error ?? conts.error ?? conteos.error ?? compr.error ?? incs.error;
    if (err) throw new Error(err.message);

    type Imp = { id: string; numero: string; estado: string; proveedor_nombre: string | null };
    type Exp = { id: string; numero: string; estado: string; cliente_nombre: string; fecha_comprometida_embarque: string | null; fecha_embarque: string | null };
    type Inc = { id: string; origen_tipo: string; origen_id: string; tipo: string; estado: string; prioridad: string; created_at: string; resuelto_at: string | null; fecha_limite: string | null };
    const I = (imps.data ?? []) as Imp[];
    const E = (exps.data ?? []) as Exp[];
    const N = (incs.data ?? []) as Inc[];

    // Operaciones
    const expAtrasadas = E.filter((e) => ["preparacion", "documentacion", "aprobada"].includes(e.estado) && e.fecha_comprometida_embarque && e.fecha_comprometida_embarque < hoy);
    const expTarde = E.filter((e) => e.fecha_embarque && e.fecha_comprometida_embarque && e.fecha_embarque > e.fecha_comprometida_embarque);
    const operaciones = {
      importaciones: { total: I.length, por_estado: contar(I, (x) => x.estado), abiertas: I.filter((x) => !["cerrada", "anulada"].includes(x.estado)).length },
      exportaciones: {
        total: E.length,
        por_estado: contar(E, (x) => x.estado),
        atrasadas: expAtrasadas.map((e) => ({ id: e.id, numero: e.numero, cliente: e.cliente_nombre, comprometida: e.fecha_comprometida_embarque, dias: dias(e.fecha_comprometida_embarque as string, hoy) })),
        embarcadas_tarde: expTarde.length,
      },
      contenedores: contar((conts.data ?? []) as { estado: string }[], (x) => x.estado),
    };

    // Inventario físico
    const C = (conteos.data ?? []) as { id: string; numero: string; estado: string; ubicacion_nombre: string | null }[];
    let inventario = { conteos: C.length, ajustados: C.filter((c) => c.estado === "ajustado").length, productos_contados: 0, con_diferencia: 0, faltante: 0, sobrante: 0, mayor_variacion: [] as { producto: string; diferencia: number; conteo: string }[] };
    if (C.length) {
      const { data: it } = await ctx.supabase.from("inventario_conteo_items").select("conteo_id, producto_nombre, stock_sistema, cantidad_fisica").eq("empresa_id", emp).in("conteo_id", C.map((c) => c.id));
      const num = new Map(C.map((c) => [c.id, c.numero]));
      const contados = ((it ?? []) as { conteo_id: string; producto_nombre: string; stock_sistema: number; cantidad_fisica: number | null }[]).filter((x) => x.cantidad_fisica !== null);
      const difs = contados.map((x) => ({ producto: x.producto_nombre, diferencia: Number(x.cantidad_fisica) - Number(x.stock_sistema), conteo: num.get(x.conteo_id) ?? "" })).filter((x) => x.diferencia !== 0);
      inventario = {
        ...inventario,
        productos_contados: contados.length,
        con_diferencia: difs.length,
        faltante: difs.filter((d) => d.diferencia < 0).reduce((s, d) => s - d.diferencia, 0),
        sobrante: difs.filter((d) => d.diferencia > 0).reduce((s, d) => s + d.diferencia, 0),
        mayor_variacion: difs.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)).slice(0, 10),
      };
    }

    // Proveedores
    const P = (compr.data ?? []) as { proveedor_nombre: string; fecha_comprometida: string; fecha_real: string | null; estado: string; documentacion_completa: boolean }[];
    const impProv = new Map(I.map((x) => [x.id, x.proveedor_nombre ?? "—"]));
    const incPorProv = new Map<string, number>();
    for (const n of N) if (n.origen_tipo === "IMPORTACION" && impProv.has(n.origen_id)) incPorProv.set(impProv.get(n.origen_id) as string, (incPorProv.get(impProv.get(n.origen_id) as string) ?? 0) + 1);
    const provs = new Map<string, { entregas: number; a_tiempo: number; demoradas: number; pendientes_vencidos: number; dias_demora: number; doc_completa: number }>();
    for (const c of P) {
      const r = provs.get(c.proveedor_nombre) ?? { entregas: 0, a_tiempo: 0, demoradas: 0, pendientes_vencidos: 0, dias_demora: 0, doc_completa: 0 };
      if (c.estado === "cumplido" && c.fecha_real) {
        r.entregas++;
        if (c.fecha_real <= c.fecha_comprometida) r.a_tiempo++;
        else {
          r.demoradas++;
          r.dias_demora += dias(c.fecha_comprometida, c.fecha_real);
        }
      }
      if (c.estado === "pendiente" && c.fecha_comprometida < hoy) r.pendientes_vencidos++;
      if (c.documentacion_completa) r.doc_completa++;
      provs.set(c.proveedor_nombre, r);
    }
    const proveedores = [...new Set([...provs.keys(), ...incPorProv.keys()])]
      .map((nombre) => {
        const r = provs.get(nombre) ?? { entregas: 0, a_tiempo: 0, demoradas: 0, pendientes_vencidos: 0, dias_demora: 0, doc_completa: 0 };
        const total = P.filter((c) => c.proveedor_nombre === nombre).length;
        return {
          proveedor: nombre,
          compromisos: total,
          entregas: r.entregas,
          a_tiempo: r.a_tiempo,
          demoradas: r.demoradas + r.pendientes_vencidos,
          cumplimiento: r.entregas ? Math.round((r.a_tiempo / r.entregas) * 100) : null,
          demora_promedio_dias: r.demoradas ? Math.round(r.dias_demora / r.demoradas) : 0,
          documentacion_completa: total ? Math.round((r.doc_completa / total) * 100) : null,
          incidentes: incPorProv.get(nombre) ?? 0,
        };
      })
      .sort((a, b) => b.compromisos + b.incidentes - (a.compromisos + a.incidentes));

    // QA
    const resueltas = N.filter((n) => n.resuelto_at);
    const qa = {
      total: N.length,
      abiertas: N.filter((n) => !["resuelto", "verificado"].includes(n.estado)).length,
      vencidas: N.filter((n) => !["resuelto", "verificado"].includes(n.estado) && n.fecha_limite && n.fecha_limite < hoy).length,
      resolucion_promedio_horas: resueltas.length ? Math.round(resueltas.reduce((s, n) => s + (Date.parse(n.resuelto_at as string) - Date.parse(n.created_at)) / 3600000, 0) / resueltas.length) : null,
      por_tipo: contar(N, (n) => n.tipo),
      por_prioridad: contar(N, (n) => n.prioridad),
      por_modulo: contar(N, (n) => n.origen_tipo),
    };

    return NextResponse.json(successResponse({ desde, hasta, operaciones, inventario, proveedores, qa }));
  } catch (err) {
    console.error("[/api/comex/reportes GET]", err);
    return NextResponse.json(errorResponse("No se pudieron armar los reportes."), { status: 500 });
  }
}
