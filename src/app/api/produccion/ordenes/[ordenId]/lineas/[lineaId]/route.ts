import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { ordenEditable, recomputarImporteOrden, TIPOS_PARTIDA, CAUSAS_ADICIONAL } from "@/lib/produccion/ordenes-helper";

type Params = { params: Promise<{ ordenId: string; lineaId: string }> };

function subtotalDe(tipo: string, cantidad: number, precio: number): number {
  const s = Math.round(cantidad * precio * 100) / 100;
  return tipo === "descuento" ? -Math.abs(s) : Math.abs(s);
}

/** PUT — edita una partida (solo en borrador). */
export async function PUT(request: NextRequest, p: Params) {
  try {
    const { ordenId, lineaId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;
    const ed = await ordenEditable(sb, emp, ordenId);
    if ("error" in ed) return NextResponse.json(errorResponse(ed.error), { status: 400 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const descripcion = String(b.descripcion ?? "").trim();
    if (!descripcion) return NextResponse.json(errorResponse("La descripción es obligatoria."), { status: 400 });
    const tipo = TIPOS_PARTIDA.includes(String(b.tipo_partida) as (typeof TIPOS_PARTIDA)[number]) ? String(b.tipo_partida) : "unidad";
    const cantidad = Number(b.cantidad) || 0;
    const precio = Number(b.precio_unitario) || 0;
    const causa = tipo === "adicional" && CAUSAS_ADICIONAL.includes(String(b.causa) as (typeof CAUSAS_ADICIONAL)[number]) ? String(b.causa) : null;

    const upd = await sb.from("prod_contratista_orden_lineas").update({
      tipo_partida: tipo, descripcion, cantidad, precio_unitario: precio, subtotal: subtotalDe(tipo, cantidad, precio), causa,
      observaciones: String(b.observaciones ?? "").trim() || null,
    }).eq("empresa_id", emp).eq("orden_id", ordenId).eq("id", lineaId);
    if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
    const importe = await recomputarImporteOrden(sb, emp, ordenId);
    return NextResponse.json(successResponse({ id: lineaId, importe_solicitado: importe }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** DELETE — elimina una partida (solo en borrador). */
export async function DELETE(request: NextRequest, p: Params) {
  try {
    const { ordenId, lineaId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;
    const ed = await ordenEditable(sb, emp, ordenId);
    if ("error" in ed) return NextResponse.json(errorResponse(ed.error), { status: 400 });
    const del = await sb.from("prod_contratista_orden_lineas").delete().eq("empresa_id", emp).eq("orden_id", ordenId).eq("id", lineaId);
    if (del.error) return NextResponse.json(errorResponse(del.error.message), { status: 400 });
    const importe = await recomputarImporteOrden(sb, emp, ordenId);
    return NextResponse.json(successResponse({ id: lineaId, importe_solicitado: importe }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
