import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Params = { params: Promise<{ id: string }> };
const CAMPOS = ["nombre","cliente_id","cliente_nombre","ubicacion","fecha_pedido","fecha_entrega_prevista","responsable_diseno","responsable_produccion","prioridad","observaciones"] as const;

/** GET /api/produccion/proyectos/[id] — proyecto + muebles + archivos. */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const pq = await ctx.supabase.from("prod_proyectos").select("*").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (pq.error || !pq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const mu = await ctx.supabase.from("prod_proyecto_muebles").select("id, codigo, descripcion, cantidad, estado, observaciones").eq("empresa_id", emp).eq("proyecto_id", id).order("created_at");
    return NextResponse.json(successResponse({ proyecto: pq.data, muebles: mu.data ?? [] }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** PUT /api/produccion/proyectos/[id] — edita datos del proyecto. */
export async function PUT(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const fecha = (v: unknown) => (v === "" || v == null ? null : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of CAMPOS) {
      if (!(k in b)) continue;
      const v = b[k];
      if (k === "nombre") { const s = String(v ?? "").trim(); if (!s) return NextResponse.json(errorResponse("El nombre no puede quedar vacío."), { status: 400 }); patch[k] = s; }
      else if (k === "prioridad") patch[k] = ["alta","media","baja"].includes(String(v)) ? String(v) : "media";
      else if (k === "fecha_pedido" || k === "fecha_entrega_prevista") patch[k] = fecha(v);
      else patch[k] = v ? String(v).trim() : null;
    }
    const up = await ctx.supabase.from("prod_proyectos").update(patch).eq("empresa_id", ctx.auth.empresa_id).eq("id", id).select("id").single();
    if (up.error) return NextResponse.json(errorResponse(up.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** DELETE /api/produccion/proyectos/[id] — borrar (solo en borrador). */
export async function DELETE(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const q = await ctx.supabase.from("prod_proyectos").select("estado").eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle();
    if (q.error || !q.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    if ((q.data as { estado: string }).estado !== "borrador")
      return NextResponse.json(errorResponse("Solo se puede borrar un proyecto en borrador."), { status: 400 });
    const del = await ctx.supabase.from("prod_proyectos").delete().eq("empresa_id", ctx.auth.empresa_id).eq("id", id);
    if (del.error) return NextResponse.json(errorResponse(del.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
