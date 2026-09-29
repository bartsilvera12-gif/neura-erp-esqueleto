import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { getComexCtx, hoyPY } from "@/lib/comex/server";
import { saldosCajas } from "@/lib/tesoreria/server";

type Alerta = { id: string; nivel: "alta" | "media" | "info"; texto: string; ruta: string };

/**
 * GET — alertas de la campanita para el usuario: incidencias asignadas y
 * vencidas (escalamiento), cuotas vencidas, cajas chicas por agotarse,
 * embarques y compromisos atrasados, conteos sin ajustar.
 * Cada consulta es independiente: si una falla, las demás se muestran igual.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const yo = ctx.auth.usuarioCatalogId ?? null;
    const admin = esRolAdminEmpresaOGlobal(ctx.auth.rol);
    const hoy = hoyPY();
    const out: Alerta[] = [];
    const n = (x: number, s: string, p: string) => `${x} ${x === 1 ? s : p}`;

    const tareas: Promise<void>[] = [
      (async () => {
        const { data } = await ctx.supabase.from("comex_incidencias").select("id, responsable_id, fecha_limite").eq("empresa_id", emp).not("estado", "in", "(resuelto,verificado)");
        const abiertas = (data ?? []) as { id: string; responsable_id: string | null; fecha_limite: string | null }[];
        const mias = yo ? abiertas.filter((i) => i.responsable_id === yo) : [];
        if (mias.length) out.push({ id: "inc-mias", nivel: "media", texto: `Tenés ${n(mias.length, "incidencia asignada", "incidencias asignadas")} sin resolver.`, ruta: "/comex/incidencias?mias=1" });
        const vencidas = abiertas.filter((i) => i.fecha_limite && i.fecha_limite < hoy && (admin || i.responsable_id === yo));
        if (vencidas.length) out.push({ id: "inc-vencidas", nivel: "alta", texto: `${n(vencidas.length, "incidencia pasó", "incidencias pasaron")} su plazo sin resolverse.`, ruta: "/comex/incidencias?vencidas=1" });
        const sinAsignar = abiertas.filter((i) => !i.responsable_id);
        if (admin && sinAsignar.length) out.push({ id: "inc-sin", nivel: "media", texto: `${n(sinAsignar.length, "incidencia", "incidencias")} sin responsable.`, ruta: "/comex/incidencias" });
      })(),
      (async () => {
        const { data } = await ctx.supabase
          .from("libro_compras_cuotas")
          .select("monto, pagado, vencimiento, libro_compras!inner(estado)")
          .eq("empresa_id", emp)
          .eq("libro_compras.estado", "registrada")
          .lt("vencimiento", hoy);
        const venc = ((data ?? []) as { monto: number; pagado: number }[]).filter((c) => Number(c.monto) - Number(c.pagado) > 0.001);
        if (venc.length) out.push({ id: "cuotas", nivel: "alta", texto: `${n(venc.length, "cuota vencida", "cuotas vencidas")} por pagar a proveedores.`, ruta: "/libro-compras/por-pagar" });
      })(),
      (async () => {
        const { data } = await ctx.supabase.from("cajas_chicas").select("id, nombre, fondo_fijo, activa").eq("empresa_id", emp).eq("activa", true);
        const cajas = (data ?? []) as { id: string; nombre: string; fondo_fijo: number | null }[];
        if (!cajas.some((c) => c.fondo_fijo)) return;
        const saldos = await saldosCajas(ctx.supabase, emp);
        for (const c of cajas)
          if (c.fondo_fijo && (saldos.get(c.id) ?? 0) < Number(c.fondo_fijo) * 0.2)
            out.push({ id: `caja-${c.id}`, nivel: "media", texto: `La caja chica ${c.nombre} tiene menos del 20% del fondo: conviene reponerla.`, ruta: `/tesoreria/caja/${c.id}` });
      })(),
      (async () => {
        const { data } = await ctx.supabase
          .from("exportaciones")
          .select("id")
          .eq("empresa_id", emp)
          .in("estado", ["preparacion", "documentacion", "aprobada"])
          .lt("fecha_comprometida_embarque", hoy);
        const c = (data ?? []).length;
        if (c) out.push({ id: "exp-atrasadas", nivel: "alta", texto: `${n(c, "exportación pasó", "exportaciones pasaron")} la fecha comprometida de embarque.`, ruta: "/exportaciones" });
      })(),
      (async () => {
        const { data } = await ctx.supabase.from("proveedor_compromisos").select("id").eq("empresa_id", emp).eq("estado", "pendiente").lt("fecha_comprometida", hoy);
        const c = (data ?? []).length;
        if (c) out.push({ id: "comp-atrasados", nivel: "media", texto: `${n(c, "compromiso de proveedor está atrasado", "compromisos de proveedores están atrasados")}.`, ruta: "/comex/compromisos" });
      })(),
      (async () => {
        if (!admin) return;
        const { data } = await ctx.supabase.from("inventario_conteos").select("id").eq("empresa_id", emp).eq("estado", "cerrado");
        const c = (data ?? []).length;
        if (c) out.push({ id: "conteos", nivel: "info", texto: `${n(c, "conteo físico cerrado espera", "conteos físicos cerrados esperan")} el ajuste de stock.`, ruta: "/comex/inventario-fisico" });
      })(),
    ];
    await Promise.allSettled(tareas);
    const orden = { alta: 0, media: 1, info: 2 };
    out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
    return NextResponse.json(successResponse({ alertas: out }));
  } catch (err) {
    console.error("[/api/alertas GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar las alertas."), { status: 500 });
  }
}
