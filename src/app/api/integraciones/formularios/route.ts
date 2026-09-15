import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS =
  "id, empresa_id, nombre, descripcion, endpoint_url, metodo, auth_header_name, auth_header_value, headers_extra, campos, activo, created_at, updated_at";

const METODOS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const { data, error } = await ctx.supabase
      .from("formularios_api")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ formularios: data ?? [] }));
  } catch (err) {
    console.error("[/api/integraciones/formularios GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar los formularios."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = String(b.nombre ?? "").trim();
    const endpoint = String(b.endpoint_url ?? "").trim();
    const metodo = String(b.metodo ?? "POST").toUpperCase();
    if (!nombre) return NextResponse.json(errorResponse("Nombre requerido."), { status: 400 });
    if (!/^https?:\/\//i.test(endpoint)) {
      return NextResponse.json(errorResponse("Endpoint debe empezar con http(s)://"), { status: 400 });
    }
    if (!METODOS.has(metodo)) return NextResponse.json(errorResponse("Método inválido."), { status: 400 });

    const insert = {
      empresa_id: ctx.auth.empresa_id,
      nombre,
      descripcion: b.descripcion ? String(b.descripcion).slice(0, 500) : null,
      endpoint_url: endpoint,
      metodo,
      auth_header_name: b.auth_header_name ? String(b.auth_header_name).trim().slice(0, 100) : null,
      auth_header_value: b.auth_header_value ? String(b.auth_header_value).slice(0, 500) : null,
      headers_extra: b.headers_extra ?? {},
      campos: Array.isArray(b.campos) ? b.campos : [],
      activo: b.activo === false ? false : true,
      created_by_user_id: ctx.auth.usuarioCatalogId ?? null,
    };

    const { data, error } = await ctx.supabase
      .from("formularios_api")
      .insert(insert)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json(successResponse({ id: (data as { id: string }).id }));
  } catch (err) {
    console.error("[/api/integraciones/formularios POST]", err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "Error interno"),
      { status: 500 },
    );
  }
}
