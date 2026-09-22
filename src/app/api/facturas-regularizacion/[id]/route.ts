import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";

export const dynamic = "force-dynamic";

// REEMITIDA solo la pone la emisión real de la factura nueva, no se elige a mano.
const ESTADOS_MANUALES = ["PENDIENTE", "CORRECTA", "ANULADA", "PENDIENTE_REEMISION"];

/** PATCH { estado?, motivo?, observaciones? } — solo admin. Guarda valor anterior y nuevo en auditoría. */
export async function PATCH(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    if (!esRolAdminEmpresaOGlobal(auth.rol))
      return NextResponse.json(errorResponse("Solo un administrador puede modificar regularizaciones."), { status: 403 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const actual = await supabase
      .from("facturas_regularizacion")
      .select("estado, motivo, observaciones")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (actual.error) throw new Error(actual.error.message);
    const antes = actual.data as unknown as { estado: string; motivo: string; observaciones: string | null } | null;
    if (!antes) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    if (antes.estado === "REEMITIDA")
      return NextResponse.json(errorResponse("Una factura ya reemitida no se puede modificar."), { status: 400 });

    const patch: Record<string, unknown> = {};
    if (typeof b.estado === "string") {
      if (!ESTADOS_MANUALES.includes(b.estado))
        return NextResponse.json(errorResponse("Estado inválido."), { status: 400 });
      patch.estado = b.estado;
    }
    if (typeof b.motivo === "string" && b.motivo.trim()) patch.motivo = b.motivo.trim();
    if (b.observaciones !== undefined) patch.observaciones = b.observaciones ? String(b.observaciones).trim() : null;
    if (!Object.keys(patch).length) return NextResponse.json(errorResponse("Nada para actualizar."), { status: 400 });
    patch.updated_at = new Date().toISOString();

    const upd = await supabase.from("facturas_regularizacion").update(patch).eq("empresa_id", auth.empresa_id).eq("id", id);
    if (upd.error) throw new Error(upd.error.message);

    const antesSel = Object.fromEntries(
      Object.keys(patch).filter((k) => k !== "updated_at").map((k) => [k, (antes as Record<string, unknown>)[k] ?? null])
    );
    const { updated_at: _u, ...despues } = patch;
    await supabase.from("facturas_exportacion_auditoria").insert({
      empresa_id: auth.empresa_id,
      accion: "REGULARIZACION_MODIFICAR",
      detalle: { regularizacion_id: id, antes: antesSel, despues },
      usuario_id: auth.user.id,
      usuario_nombre: auth.nombre ?? auth.user.email ?? null,
    });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/facturas-regularizacion/[id] PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo actualizar."), { status: 500 });
  }
}
