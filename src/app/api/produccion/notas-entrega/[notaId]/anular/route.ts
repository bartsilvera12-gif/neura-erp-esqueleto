import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

type Params = { params: Promise<{ notaId: string }> };

/**
 * POST — anula la nota con motivo. Si estaba confirmada, reversa los movimientos
 * de inventario que había generado (no borra el original: registra el reverso).
 */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { notaId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const motivo = String(b.motivo ?? "").trim();
    if (!motivo) return NextResponse.json(errorResponse("Indicá el motivo de la anulación."), { status: 400 });

    const nq = await sb.from("prod_notas_entrega").select("id, numero, estado").eq("empresa_id", emp).eq("id", notaId).maybeSingle();
    if (nq.error || !nq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const nota = nq.data as { id: string; numero: string; estado: string };
    if (nota.estado === "anulada") return NextResponse.json(errorResponse("La nota ya está anulada."), { status: 400 });

    if (nota.estado === "confirmada") {
      // Reversar cada movimiento generado (que no haya sido reversado ya).
      const dq = await sb.from("prod_nota_entrega_detalle").select("id, articulo_tipo, articulo_id, movimiento_id").eq("empresa_id", emp).eq("nota_id", notaId);
      for (const l of (dq.data ?? []) as { id: string; articulo_tipo: string; articulo_id: string; movimiento_id: string | null }[]) {
        if (!l.movimiento_id) continue;
        const ya = await sb.from("prod_inventario_movimientos").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("reverso_de", l.movimiento_id);
        if ((ya.count ?? 0) > 0) continue;
        const orig = await sb.from("prod_inventario_movimientos").select("delta_fisico, delta_utilizable, cantidad").eq("empresa_id", emp).eq("id", l.movimiento_id).maybeSingle();
        if (!orig.data) continue;
        const od = orig.data as { delta_fisico: number; delta_utilizable: number; cantidad: number };
        await sb.from("prod_inventario_movimientos").insert({
          empresa_id: emp, articulo_tipo: l.articulo_tipo, articulo_id: l.articulo_id, tipo: "reverso",
          cantidad: od.cantidad, delta_fisico: -Number(od.delta_fisico) || 0, delta_utilizable: -Number(od.delta_utilizable) || 0,
          origen_tipo: "reverso", origen_id: notaId, referencia: nota.numero, motivo: `Anulación nota ${nota.numero}: ${motivo}`,
          reverso_de: l.movimiento_id, usuario_id: ctx.auth.usuarioCatalogId ?? null, usuario_nombre: ctx.auth.user?.email ?? null,
        });
      }
    }

    const upd = await sb.from("prod_notas_entrega").update({
      estado: "anulada", motivo_anulacion: motivo, updated_at: new Date().toISOString(),
    }).eq("empresa_id", emp).eq("id", notaId);
    if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id: notaId, estado: "anulada" }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
