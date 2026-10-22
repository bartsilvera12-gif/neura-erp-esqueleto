import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const LIST_COLS = "id, codigo, nombre, cliente_nombre, ubicacion, fecha_pedido, fecha_entrega_prevista, prioridad, estado, created_at";

/** Siguiente código PRJ-AAAA-NNNN (reinicia por año, best-effort). */
async function siguienteCodigo(sb: import("@/lib/supabase/schema").AppSupabaseClient, emp: string): Promise<string> {
  const anio = new Date().getFullYear();
  const pref = `PRJ-${anio}-`;
  const { data } = await sb.from("prod_proyectos").select("codigo").eq("empresa_id", emp).like("codigo", `${pref}%`).order("codigo", { ascending: false }).limit(1);
  let n = 1;
  const last = (data?.[0] as { codigo?: string } | undefined)?.codigo;
  if (last) { const m = last.match(/-(\d+)$/); if (m) n = parseInt(m[1], 10) + 1; }
  return `${pref}${String(n).padStart(4, "0")}`;
}

/** GET /api/produccion/proyectos?estado= — listado. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const estado = new URL(request.url).searchParams.get("estado");
    let q = ctx.supabase.from("prod_proyectos").select(LIST_COLS).eq("empresa_id", ctx.auth.empresa_id).order("created_at", { ascending: false });
    if (estado) q = q.eq("estado", estado);
    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ proyectos: data ?? [] }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** POST /api/produccion/proyectos — crea un proyecto (en borrador). */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = String(b.nombre ?? "").trim();
    if (!nombre) return NextResponse.json(errorResponse("El nombre del proyecto es obligatorio."), { status: 400 });
    const fecha = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
    const prioridad = ["alta", "media", "baja"].includes(String(b.prioridad)) ? String(b.prioridad) : "media";

    const codigo = await siguienteCodigo(ctx.supabase as unknown as import("@/lib/supabase/schema").AppSupabaseClient, emp);
    const row = {
      empresa_id: emp,
      codigo,
      nombre,
      cliente_id: b.cliente_id ? String(b.cliente_id) : null,
      cliente_nombre: String(b.cliente_nombre ?? "").trim() || null,
      ubicacion: String(b.ubicacion ?? "").trim() || null,
      fecha_pedido: fecha(b.fecha_pedido),
      fecha_entrega_prevista: fecha(b.fecha_entrega_prevista),
      responsable_diseno: String(b.responsable_diseno ?? "").trim() || null,
      responsable_produccion: String(b.responsable_produccion ?? "").trim() || null,
      prioridad,
      estado: "borrador",
      observaciones: String(b.observaciones ?? "").trim() || null,
      created_by: ctx.auth.usuarioCatalogId ?? null,
      created_by_nombre: ctx.auth.user?.email ?? null,
    };
    const ins = await ctx.supabase.from("prod_proyectos").insert(row).select("id, codigo").single();
    if (ins.error) {
      const dup = (ins.error as { code?: string }).code === "23505";
      return NextResponse.json(errorResponse(dup ? "Código de proyecto repetido, probá de nuevo." : ins.error.message), { status: 400 });
    }
    return NextResponse.json(successResponse({ proyecto: ins.data }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
