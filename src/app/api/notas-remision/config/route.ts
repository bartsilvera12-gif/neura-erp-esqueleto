import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";

const COLS = "timbrado, establecimiento, punto_expedicion, vigencia_desde, vigencia_hasta, proximo_numero";

/** GET — timbrado de las notas de remisión (el que autoriza la DNIT). */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase.from("notas_remision_config").select(COLS).eq("empresa_id", ctx.auth.empresa_id).maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ config: data ?? null }));
  } catch (err) {
    console.error("[/api/notas-remision/config GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el timbrado de remisiones."), { status: 500 });
  }
}

/** PUT { timbrado, establecimiento, punto_expedicion, vigencia_desde, vigencia_hasta, proximo_numero } — solo admin. */
export async function PUT(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede cambiar el timbrado."), { status: 403 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const timbrado = String(b.timbrado ?? "").trim();
    const est = String(b.establecimiento ?? "").trim().padStart(3, "0");
    const punto = String(b.punto_expedicion ?? "").trim().padStart(3, "0");
    const prox = Math.floor(Number(b.proximo_numero));
    const fecha = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
    if (!/^\d{6,10}$/.test(timbrado)) return NextResponse.json(errorResponse("El timbrado son solo números (8 dígitos)."), { status: 400 });
    if (!/^\d{3}$/.test(est) || !/^\d{3}$/.test(punto)) return NextResponse.json(errorResponse("Establecimiento y punto son de 3 dígitos (ej. 001 y 004)."), { status: 400 });
    if (!(prox >= 1)) return NextResponse.json(errorResponse("El próximo número tiene que ser 1 o más."), { status: 400 });
    const { error } = await ctx.supabase.from("notas_remision_config").upsert(
      {
        empresa_id: ctx.auth.empresa_id,
        timbrado,
        establecimiento: est,
        punto_expedicion: punto,
        vigencia_desde: fecha(b.vigencia_desde),
        vigencia_hasta: fecha(b.vigencia_hasta),
        proximo_numero: prox,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "empresa_id" }
    );
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    console.error("[/api/notas-remision/config PUT]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo guardar el timbrado."), { status: 500 });
  }
}
