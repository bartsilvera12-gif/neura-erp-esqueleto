import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Params = { params: Promise<{ id: string }> };
const key = (tipo: string, id: string) => `${tipo}:${id}`;

/**
 * GET — conciliación de materiales del proyecto (spec 5.6):
 * por cada material requerido muestra requerido, reservado, entregado, devuelto,
 * consumido (entregado − devuelto) y pendiente (requerido − consumido).
 */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase;

    const [matQ, resQ, notasQ] = await Promise.all([
      sb.from("prod_proyecto_materiales").select("id, articulo_tipo, articulo_id, descripcion, unidad, cantidad_requerida").eq("empresa_id", emp).eq("proyecto_id", id).order("created_at"),
      sb.from("prod_inventario_reservas").select("articulo_tipo, articulo_id, cantidad").eq("empresa_id", emp).eq("proyecto_id", id).eq("estado", "activa"),
      sb.from("prod_notas_entrega").select("id, tipo").eq("empresa_id", emp).eq("proyecto_id", id).eq("estado", "confirmada"),
    ]);

    const reservado = new Map<string, number>();
    for (const r of (resQ.data ?? []) as { articulo_tipo: string; articulo_id: string; cantidad: number }[]) reservado.set(key(r.articulo_tipo, r.articulo_id), (reservado.get(key(r.articulo_tipo, r.articulo_id)) ?? 0) + (Number(r.cantidad) || 0));

    const notaTipo = new Map<string, string>();
    for (const nt of (notasQ.data ?? []) as { id: string; tipo: string }[]) notaTipo.set(nt.id, nt.tipo);
    const entregado = new Map<string, number>(); const devuelto = new Map<string, number>();
    if (notaTipo.size > 0) {
      const detQ = await sb.from("prod_nota_entrega_detalle").select("nota_id, articulo_tipo, articulo_id, cantidad").eq("empresa_id", emp).in("nota_id", [...notaTipo.keys()]);
      for (const d of (detQ.data ?? []) as { nota_id: string; articulo_tipo: string; articulo_id: string; cantidad: number }[]) {
        const k = key(d.articulo_tipo, d.articulo_id); const c = Number(d.cantidad) || 0;
        if (notaTipo.get(d.nota_id) === "devolucion") devuelto.set(k, (devuelto.get(k) ?? 0) + c);
        else entregado.set(k, (entregado.get(k) ?? 0) + c);
      }
    }

    const filas = ((matQ.data ?? []) as Record<string, unknown>[]).map((m) => {
      const k = key(String(m.articulo_tipo), String(m.articulo_id));
      const req = Number(m.cantidad_requerida) || 0;
      const ent = entregado.get(k) ?? 0;
      const dev = devuelto.get(k) ?? 0;
      const consumido = ent - dev;
      return {
        id: String(m.id), articulo_tipo: String(m.articulo_tipo), descripcion: (m.descripcion as string) ?? "", unidad: (m.unidad as string) ?? "",
        requerido: req, reservado: reservado.get(k) ?? 0, entregado: ent, devuelto: dev, consumido, pendiente: req - consumido,
      };
    });
    return NextResponse.json(successResponse({ conciliacion: filas }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
