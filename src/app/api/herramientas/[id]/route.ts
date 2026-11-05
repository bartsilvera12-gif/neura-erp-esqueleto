import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { HERRAMIENTA_COLS, normalizarInput } from "@/lib/herramientas/server";

/** PATCH /api/herramientas/[id] — editar (datos o solo cambio de estado). */
export async function PATCH(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    // Si viene nombre, se re-valida todo el input. Si solo viene `estado`,
    // se hace un update parcial.
    let update: Record<string, unknown>;
    if (b.nombre !== undefined) {
      update = { ...normalizarInput(b), updated_at: new Date().toISOString() };
    } else {
      update = { updated_at: new Date().toISOString() };
      for (const k of [
        "categoria", "marca", "modelo", "numero_serie", "ubicacion",
        "responsable", "estado", "fecha_adquisicion", "costo", "observaciones",
      ]) {
        if (k in b) update[k] = b[k];
      }
    }
    const { data, error } = await ctx.supabase
      .from("herramientas")
      .update(update)
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id)
      .select(HERRAMIENTA_COLS)
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ herramienta: data }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("[/api/herramientas/:id PATCH]", msg);
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}

/** DELETE /api/herramientas/[id] — baja (hard delete). */
export async function DELETE(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { error } = await ctx.supabase.from("herramientas").delete().eq("empresa_id", ctx.auth.empresa_id).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("[/api/herramientas/:id DELETE]", msg);
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}
