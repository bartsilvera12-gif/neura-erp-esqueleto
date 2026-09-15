import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS =
  "id, empresa_id, nombre, descripcion, endpoint_url, metodo, auth_header_name, auth_header_value, headers_extra, campos, activo, created_at, updated_at";

const METODOS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const { data, error } = await ctx.supabase
      .from("formularios_api")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json(errorResponse("Formulario no encontrado."), { status: 404 });
    return NextResponse.json(successResponse({ formulario: data }));
  } catch (err) {
    console.error("[/api/integraciones/formularios/:id GET]", err);
    return NextResponse.json(errorResponse("No se pudo cargar el formulario."), { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.nombre !== undefined) update.nombre = String(b.nombre).trim();
    if (b.descripcion !== undefined) update.descripcion = b.descripcion ? String(b.descripcion).slice(0, 500) : null;
    if (b.endpoint_url !== undefined) {
      const e = String(b.endpoint_url).trim();
      if (!/^https?:\/\//i.test(e)) {
        return NextResponse.json(errorResponse("Endpoint debe empezar con http(s)://"), { status: 400 });
      }
      update.endpoint_url = e;
    }
    if (b.metodo !== undefined) {
      const m = String(b.metodo).toUpperCase();
      if (!METODOS.has(m)) return NextResponse.json(errorResponse("Método inválido."), { status: 400 });
      update.metodo = m;
    }
    if (b.auth_header_name !== undefined) update.auth_header_name = b.auth_header_name ? String(b.auth_header_name).trim().slice(0, 100) : null;
    if (b.auth_header_value !== undefined) update.auth_header_value = b.auth_header_value ? String(b.auth_header_value).slice(0, 500) : null;
    if (b.headers_extra !== undefined) update.headers_extra = b.headers_extra ?? {};
    if (b.campos !== undefined) update.campos = Array.isArray(b.campos) ? b.campos : [];
    if (b.activo !== undefined) update.activo = !!b.activo;

    const { error } = await ctx.supabase
      .from("formularios_api")
      .update(update)
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/integraciones/formularios/:id PATCH]", err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "Error interno"),
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { error } = await ctx.supabase
      .from("formularios_api")
      .delete()
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/integraciones/formularios/:id DELETE]", err);
    return NextResponse.json(errorResponse("No se pudo eliminar."), { status: 500 });
  }
}
