import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;

    let body: Record<string, unknown> = {};
    try { body = (await request.json()) as Record<string, unknown>; } catch {}
    const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";
    if (!motivo) return NextResponse.json(errorResponse("Indicá el motivo de anulación."), { status: 400 });

    const nombre = auth.nombre ?? auth.user.email ?? null;
    const upd = await supabase
      .from("facturas_exportacion")
      .update({
        estado: "ANULADA",
        motivo_anulacion: motivo,
        anulada_at: new Date().toISOString(),
        anulada_por: auth.user.id,
        anulada_por_nombre: nombre,
      })
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .eq("estado", "EMITIDA")
      .select("id, numero_formateado")
      .maybeSingle();
    if (upd.error) throw new Error(upd.error.message);
    if (!upd.data) return NextResponse.json(errorResponse("La factura ya está anulada o no existe."), { status: 400 });

    await supabase.from("facturas_exportacion_auditoria").insert({
      empresa_id: auth.empresa_id,
      factura_id: id,
      accion: "ANULAR",
      detalle: { motivo },
      usuario_id: auth.user.id,
      usuario_nombre: nombre,
    });

    return NextResponse.json(successResponse({ id, anulada: true }));
  } catch (err) {
    console.error("[/api/facturas-exportacion/[id]/anular]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo anular la factura."), { status: 500 });
  }
}
