import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

type Params = { params: Promise<{ id: string }> };

/** Próximo número correlativo NE-AAAA-NNNN para la empresa. */
async function siguienteNumero(sb: AppSupabaseClient, emp: string): Promise<string> {
  const year = new Date().getFullYear();
  const pref = `NE-${year}-`;
  const q = await sb.from("prod_notas_entrega").select("numero").eq("empresa_id", emp).like("numero", `${pref}%`).order("numero", { ascending: false }).limit(1);
  const ult = (q.data?.[0] as { numero?: string } | undefined)?.numero ?? "";
  const n = ult ? parseInt(ult.slice(pref.length), 10) || 0 : 0;
  return `${pref}${String(n + 1).padStart(4, "0")}`;
}

/** GET — notas de entrega del proyecto (la más nueva primero). */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("prod_notas_entrega")
      .select("id, numero, contratista_id, contratista_nombre, tipo, fecha, estado, created_at")
      .eq("empresa_id", ctx.auth.empresa_id).eq("proyecto_id", id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ notas: data ?? [] }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** POST — crea una nota de entrega (o devolución) en borrador. */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const pq = await ctx.supabase.from("prod_proyectos").select("id").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (pq.error || !pq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const tipo = b.tipo === "devolucion" ? "devolucion" : "entrega";
    const contratistaId = String(b.contratista_id ?? "").trim();
    let contratistaNombre: string | null = null;
    if (contratistaId) {
      const cq = await ctx.supabase.from("prod_contratistas").select("nombre").eq("empresa_id", emp).eq("id", contratistaId).maybeSingle();
      if (cq.error || !cq.data) return NextResponse.json(errorResponse("Contratista no encontrado."), { status: 404 });
      contratistaNombre = (cq.data as { nombre: string }).nombre;
    }
    const numero = await siguienteNumero(ctx.supabase as unknown as AppSupabaseClient, emp);

    const ins = await ctx.supabase.from("prod_notas_entrega").insert({
      empresa_id: emp, numero, proyecto_id: id, tipo,
      contratista_id: contratistaId || null, contratista_nombre: contratistaNombre,
      estado: "borrador", observaciones: String(b.observaciones ?? "").trim() || null,
      created_by: ctx.auth.usuarioCatalogId ?? null, created_by_nombre: ctx.auth.user?.email ?? null,
    }).select("id, numero").single();
    if (ins.error) return NextResponse.json(errorResponse(ins.error.message), { status: 400 });
    return NextResponse.json(successResponse({ nota: ins.data }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
