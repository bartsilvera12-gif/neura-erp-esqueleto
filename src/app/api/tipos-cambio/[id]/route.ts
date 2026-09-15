import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const MONEDAS = new Set(["PYG", "USD", "BOB"]);

export async function PATCH(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (b.fecha !== undefined && typeof b.fecha === "string") update.fecha = b.fecha;
    if (b.moneda_origen !== undefined) {
      const v = String(b.moneda_origen).toUpperCase();
      if (!MONEDAS.has(v)) return NextResponse.json(errorResponse("Moneda origen invalida."), { status: 400 });
      update.moneda_origen = v;
    }
    if (b.moneda_destino !== undefined) {
      const v = String(b.moneda_destino).toUpperCase();
      if (!MONEDAS.has(v)) return NextResponse.json(errorResponse("Moneda destino invalida."), { status: 400 });
      update.moneda_destino = v;
    }
    if (b.tasa !== undefined) {
      const n = Number(b.tasa);
      if (!Number.isFinite(n) || n <= 0) return NextResponse.json(errorResponse("Tasa invalida."), { status: 400 });
      update.tasa = n;
    }
    if (b.observacion !== undefined) update.observacion = b.observacion ? String(b.observacion).slice(0, 300) : null;
    if (typeof update.moneda_origen === "string" && typeof update.moneda_destino === "string" && update.moneda_origen === update.moneda_destino) {
      return NextResponse.json(errorResponse("Origen y destino deben diferir."), { status: 400 });
    }

    const { error } = await ctx.supabase
      .from("tipos_cambio")
      .update(update)
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/tipos-cambio/:id PATCH]", err);
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
      .from("tipos_cambio")
      .delete()
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/tipos-cambio/:id DELETE]", err);
    return NextResponse.json(errorResponse("No se pudo eliminar."), { status: 500 });
  }
}
