import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { recomputarImporteOrden } from "@/lib/produccion/ordenes-helper";

type Params = { params: Promise<{ ordenId: string }> };

/**
 * POST — aprueba la cotización del contratista. Fija importe_aprobado = solicitado.
 * Una versión aprobada ya no se edita (para cambios, nueva versión u orden de cambio).
 */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { ordenId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;

    const oq = await sb.from("prod_contratista_ordenes").select("estado").eq("empresa_id", emp).eq("id", ordenId).maybeSingle();
    if (oq.error || !oq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    if ((oq.data as { estado: string }).estado === "aprobada") return NextResponse.json(errorResponse("La cotización ya está aprobada."), { status: 400 });

    const importe = await recomputarImporteOrden(sb, emp, ordenId);
    const upd = await sb.from("prod_contratista_ordenes").update({
      estado: "aprobada", importe_aprobado: importe,
      aprobado_por: ctx.auth.user?.email ?? null, aprobado_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("empresa_id", emp).eq("id", ordenId);
    if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id: ordenId, estado: "aprobada", importe_aprobado: importe }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
