import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { REGULARIZACION_BUCKET } from "@/lib/facturas-exportacion/regularizacion-storage";

export const dynamic = "force-dynamic";

// REEMITIDA solo la pone la emisión real de la factura nueva, no se elige a mano.
const ESTADOS_MANUALES = ["PENDIENTE", "CORRECTA", "ANULADA", "PENDIENTE_REEMISION"];

/** PATCH { estado?, motivo?, observaciones?, tipo?, moneda?, cliente_pais? } — solo admin. Guarda valor anterior y nuevo en auditoría. */
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
      .select("estado, motivo, observaciones, tipo, moneda, cliente_pais")
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
    if (b.tipo !== undefined) {
      if (b.tipo !== "LOCAL" && b.tipo !== "EXPORTACION") return NextResponse.json(errorResponse("Tipo de factura inválido."), { status: 400 });
      patch.tipo = b.tipo;
    }
    if (typeof b.moneda === "string") {
      if (!["USD", "PYG", "BOB"].includes(b.moneda)) return NextResponse.json(errorResponse("Moneda inválida."), { status: 400 });
      patch.moneda = b.moneda;
    }
    if (typeof b.cliente_pais === "string") patch.cliente_pais = b.cliente_pais.trim().toUpperCase() || null;
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

/**
 * DELETE — borra la regularización, con su PDF adjunto.
 * Solo admin, y solo mientras no haya una factura emitida colgando de ella:
 * una reemitida ya tiene número fiscal y no se puede deshacer por acá.
 */
export async function DELETE(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    if (!esRolAdminEmpresaOGlobal(auth.rol))
      return NextResponse.json(errorResponse("Solo un administrador puede borrar regularizaciones."), { status: 403 });

    const q = await supabase
      .from("facturas_regularizacion")
      .select("estado, numero_original, pdf_path, factura_vinculada_id")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (q.error) throw new Error(q.error.message);
    const reg = q.data as unknown as { estado: string; numero_original: string; pdf_path: string | null; factura_vinculada_id: string | null } | null;
    if (!reg) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    if (reg.estado === "REEMITIDA" || reg.factura_vinculada_id)
      return NextResponse.json(
        errorResponse("Esta regularización ya tiene una factura emitida: anulá esa factura antes de borrarla."),
        { status: 400 }
      );

    if (reg.pdf_path) {
      await supabase.storage.from(REGULARIZACION_BUCKET).remove([reg.pdf_path]).catch(() => undefined);
    }
    const del = await supabase.from("facturas_regularizacion").delete().eq("empresa_id", auth.empresa_id).eq("id", id);
    if (del.error) throw new Error(del.error.message);
    return NextResponse.json(successResponse({ id, numero_original: reg.numero_original }));
  } catch (err) {
    console.error("[/api/facturas-regularizacion/[id] DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo borrar la regularización."), { status: 500 });
  }
}
