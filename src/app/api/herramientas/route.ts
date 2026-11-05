import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { HERRAMIENTA_COLS, listarHerramientas, normalizarInput } from "@/lib/herramientas/server";

/** GET /api/herramientas — listado de herramientas / máquinas de la empresa. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sp = new URL(request.url).searchParams;
    const data = await listarHerramientas(ctx.supabase, ctx.auth.empresa_id, {
      estado: sp.get("estado"),
      buscar: sp.get("q"),
    });
    return NextResponse.json(successResponse({ herramientas: data }));
  } catch (err) {
    console.error("[/api/herramientas GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar las herramientas."), { status: 500 });
  }
}

/** POST /api/herramientas — alta de una herramienta / máquina. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const input = normalizarInput(b);
    const { data, error } = await ctx.supabase
      .from("herramientas")
      .insert({ ...input, empresa_id: ctx.auth.empresa_id })
      .select(HERRAMIENTA_COLS)
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ herramienta: data }), { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("[/api/herramientas POST]", msg);
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}
