import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS = "id, empresa_id, codigo, nombre, es_principal, activa, establecimiento, punto_expedicion, created_at, updated_at";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("sucursales")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("es_principal", { ascending: false })
      .order("nombre", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ sucursales: data ?? [] }));
  } catch (err) {
    console.error("[/api/sucursales GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar las sucursales."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = String(b.nombre ?? "").trim();
    const codigo = String(b.codigo ?? "").trim();
    if (!nombre) return NextResponse.json(errorResponse("Nombre requerido."), { status: 400 });
    if (!codigo) return NextResponse.json(errorResponse("Código requerido."), { status: 400 });
    const { data, error } = await ctx.supabase
      .from("sucursales")
      .insert({
        empresa_id: ctx.auth.empresa_id,
        codigo,
        nombre,
        es_principal: !!b.es_principal,
        activa: b.activa === false ? false : true,
        establecimiento: b.establecimiento ? String(b.establecimiento).trim() : null,
        punto_expedicion: b.punto_expedicion ? String(b.punto_expedicion).trim() : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id: (data as { id: string }).id }));
  } catch (err) {
    console.error("[/api/sucursales POST]", err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "Error interno"),
      { status: 500 },
    );
  }
}
