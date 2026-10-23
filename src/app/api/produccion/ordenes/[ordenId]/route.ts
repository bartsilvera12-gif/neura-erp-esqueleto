import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { ordenEditable, recomputarImporteOrden, MODALIDADES, type Modalidad } from "@/lib/produccion/ordenes-helper";
import { signProduccionArchivo } from "@/lib/produccion/archivos-storage";

type Params = { params: Promise<{ ordenId: string }> };

/** GET — cabecera de la orden + sus líneas + URL firmada del archivo. */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { ordenId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;
    const oq = await sb.from("prod_contratista_ordenes").select("*").eq("empresa_id", emp).eq("id", ordenId).maybeSingle();
    if (oq.error || !oq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const lq = await sb.from("prod_contratista_orden_lineas").select("id, tipo_partida, descripcion, cantidad, precio_unitario, subtotal, causa, observaciones").eq("empresa_id", emp).eq("orden_id", ordenId).order("created_at");
    const o = oq.data as Record<string, unknown>;
    const archivo_url = o.archivo_path ? await signProduccionArchivo(sb, String(o.archivo_path)) : null;
    return NextResponse.json(successResponse({ orden: o, lineas: lq.data ?? [], archivo_url }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** PUT — edita la cabecera de la orden (solo en borrador). */
export async function PUT(request: NextRequest, p: Params) {
  try {
    const { ordenId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;
    const ed = await ordenEditable(sb, emp, ordenId);
    if ("error" in ed) return NextResponse.json(errorResponse(ed.error), { status: 400 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.modalidad !== undefined) patch.modalidad = (MODALIDADES.includes(String(b.modalidad) as Modalidad) ? String(b.modalidad) : "global");
    if (b.importe_base !== undefined) patch.importe_base = Number(b.importe_base) || 0;
    for (const f of ["alcance", "plazo", "condiciones", "exclusiones", "motivo"]) {
      if (b[f] !== undefined) patch[f] = String(b[f] ?? "").trim() || null;
    }
    const upd = await sb.from("prod_contratista_ordenes").update(patch).eq("empresa_id", emp).eq("id", ordenId);
    if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
    const importe = await recomputarImporteOrden(sb, emp, ordenId);
    return NextResponse.json(successResponse({ id: ordenId, importe_solicitado: importe }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** DELETE — borra una versión en borrador. */
export async function DELETE(request: NextRequest, p: Params) {
  try {
    const { ordenId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const q = await ctx.supabase.from("prod_contratista_ordenes").select("estado").eq("empresa_id", emp).eq("id", ordenId).maybeSingle();
    if (q.error || !q.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    if ((q.data as { estado: string }).estado !== "borrador") return NextResponse.json(errorResponse("Solo se puede borrar una versión en borrador."), { status: 400 });
    const del = await ctx.supabase.from("prod_contratista_ordenes").delete().eq("empresa_id", emp).eq("id", ordenId);
    if (del.error) return NextResponse.json(errorResponse(del.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id: ordenId }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
