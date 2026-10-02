import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { esUuid } from "@/lib/comex/server";

const COLS =
  "id, timbrado, establecimiento, punto_expedicion, vigencia_desde, vigencia_hasta, proximo_numero, activo, modo_prueba, proximo_numero_prueba";

/** GET — los timbrados de notas de remisión que autorizó la DNIT. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("notas_remision_config")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("punto_expedicion");
    if (error) throw new Error(error.message);
    const lista = (data ?? []) as unknown as Record<string, unknown>[];
    // `config` queda por compatibilidad: el primero activo.
    return NextResponse.json(successResponse({ timbrados: lista, config: lista.find((x) => x.activo !== false) ?? null }));
  } catch (err) {
    console.error("[/api/notas-remision/config GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los timbrados de remisiones."), { status: 500 });
  }
}

function datos(b: Record<string, unknown>): { datos: Record<string, unknown> } | { error: string } {
  const timbrado = String(b.timbrado ?? "").trim();
  const est = String(b.establecimiento ?? "").trim().padStart(3, "0");
  const punto = String(b.punto_expedicion ?? "").trim().padStart(3, "0");
  const prox = Math.floor(Number(b.proximo_numero));
  const proxPrueba = Math.max(1, Math.floor(Number(b.proximo_numero_prueba)) || 1);
  const fecha = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
  if (!/^\d{6,10}$/.test(timbrado)) return { error: "El timbrado son solo números (8 dígitos)." };
  if (!/^\d{3}$/.test(est) || !/^\d{3}$/.test(punto)) return { error: "Establecimiento y punto son de 3 dígitos (ej. 001 y 004)." };
  if (!(prox >= 1)) return { error: "El próximo número tiene que ser 1 o más." };
  return {
    datos: {
      timbrado,
      establecimiento: est,
      punto_expedicion: punto,
      vigencia_desde: fecha(b.vigencia_desde),
      vigencia_hasta: fecha(b.vigencia_hasta),
      proximo_numero: prox,
      proximo_numero_prueba: proxPrueba,
      modo_prueba: b.modo_prueba === undefined ? true : b.modo_prueba === true,
      activo: b.activo === undefined ? true : b.activo === true,
      updated_at: new Date().toISOString(),
    },
  };
}

/** POST — agrega un timbrado. Solo admin. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede cargar timbrados."), { status: 403 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const d = datos(b);
    if ("error" in d) return NextResponse.json(errorResponse(d.error), { status: 400 });
    const { data, error } = await ctx.supabase
      .from("notas_remision_config")
      .insert({ ...d.datos, empresa_id: ctx.auth.empresa_id })
      .select("id")
      .single();
    if (error) {
      if (/duplicate|unique|23505/i.test(error.message))
        return NextResponse.json(errorResponse("Ya existe ese timbrado para ese punto de expedición."), { status: 409 });
      throw new Error(error.message);
    }
    return NextResponse.json(successResponse({ id: (data as { id: string }).id }));
  } catch (err) {
    console.error("[/api/notas-remision/config POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el timbrado."), { status: 500 });
  }
}

/** PUT { id, … } — modifica un timbrado. Sin id, crea el primero (compatibilidad). */
export async function PUT(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede cambiar el timbrado."), { status: 403 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const d = datos(b);
    if ("error" in d) return NextResponse.json(errorResponse(d.error), { status: 400 });
    const emp = ctx.auth.empresa_id;

    if (esUuid(b.id)) {
      const { error } = await ctx.supabase.from("notas_remision_config").update(d.datos).eq("empresa_id", emp).eq("id", String(b.id));
      if (error) throw new Error(error.message);
      return NextResponse.json(successResponse({ id: b.id }));
    }
    const { data, error } = await ctx.supabase
      .from("notas_remision_config")
      .insert({ ...d.datos, empresa_id: emp })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id: (data as { id: string }).id }));
  } catch (err) {
    console.error("[/api/notas-remision/config PUT]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo guardar el timbrado."), { status: 500 });
  }
}
