import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * POST /api/integraciones/formularios/:id/ejecutar
 * Body: { payload: {...} }
 * Envia el payload al endpoint configurado y devuelve la respuesta.
 * La ejecucion queda registrada en formulario_ejecuciones (auditoria).
 */
export async function POST(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParams.params;
  const ctx = await getTenantSupabaseFromAuthWithRol(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { payload?: Record<string, unknown> };
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};

  const { data: formRow, error: eForm } = await ctx.supabase
    .from("formularios_api")
    .select("id, endpoint_url, metodo, auth_header_name, auth_header_value, headers_extra, activo")
    .eq("empresa_id", ctx.auth.empresa_id)
    .eq("id", id)
    .maybeSingle();
  if (eForm) return NextResponse.json(errorResponse(eForm.message), { status: 500 });
  if (!formRow) return NextResponse.json(errorResponse("Formulario no encontrado."), { status: 404 });
  if (!(formRow as { activo: boolean }).activo) {
    return NextResponse.json(errorResponse("Formulario inactivo."), { status: 400 });
  }

  const form = formRow as {
    endpoint_url: string;
    metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    auth_header_name: string | null;
    auth_header_value: string | null;
    headers_extra: Record<string, string> | null;
  };

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(form.headers_extra ?? {}),
  };
  if (form.auth_header_name && form.auth_header_value) {
    headers[form.auth_header_name] = form.auth_header_value;
  }

  let status = 0;
  let respuesta: unknown = null;
  let errorText: string | null = null;

  try {
    let url = form.endpoint_url;
    const init: RequestInit = { method: form.metodo, headers };
    if (form.metodo === "GET" || form.metodo === "DELETE") {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(payload)) qs.set(k, String(v ?? ""));
      const sep = url.includes("?") ? "&" : "?";
      url = qs.toString() ? `${url}${sep}${qs.toString()}` : url;
    } else {
      init.body = JSON.stringify(payload);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    init.signal = controller.signal;

    const r = await fetch(url, init);
    clearTimeout(timeoutId);
    status = r.status;
    const text = await r.text();
    try {
      respuesta = text ? JSON.parse(text) : null;
    } catch {
      respuesta = text;
    }
    if (!r.ok) errorText = `HTTP ${r.status}`;
  } catch (e) {
    errorText = e instanceof Error ? e.message : "Error de red";
  }

  // Log de la ejecucion
  await ctx.supabase.from("formulario_ejecuciones").insert({
    empresa_id: ctx.auth.empresa_id,
    formulario_id: id,
    payload,
    status: status || null,
    respuesta,
    error: errorText,
    created_by_user_id: ctx.auth.usuarioCatalogId ?? null,
  });

  return NextResponse.json(
    successResponse({ status, respuesta, error: errorText }),
    { status: errorText ? 502 : 200 },
  );
}
