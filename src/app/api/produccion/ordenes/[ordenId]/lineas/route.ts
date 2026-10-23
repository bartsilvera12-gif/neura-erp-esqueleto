import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { ordenEditable, recomputarImporteOrden, TIPOS_PARTIDA, CAUSAS_ADICIONAL } from "@/lib/produccion/ordenes-helper";

type Params = { params: Promise<{ ordenId: string }> };

/** Calcula el subtotal de una partida (el descuento se guarda negativo). */
function subtotalDe(tipo: string, cantidad: number, precio: number): number {
  const s = Math.round(cantidad * precio * 100) / 100;
  return tipo === "descuento" ? -Math.abs(s) : Math.abs(s);
}

/** POST — agrega una partida a la orden (solo en borrador). */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { ordenId } = await p.params;
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

    const ins = await sb.from("prod_contratista_orden_lineas").insert({
      empresa_id: emp, orden_id: ordenId, tipo_partida: tipo, descripcion,
      cantidad, precio_unitario: precio, subtotal: subtotalDe(tipo, cantidad, precio), causa,
      observaciones: String(b.observaciones ?? "").trim() || null,
    }).select("id").single();
    if (ins.error) return NextResponse.json(errorResponse(ins.error.message), { status: 400 });
    const importe = await recomputarImporteOrden(sb, emp, ordenId);
    return NextResponse.json(successResponse({ linea: ins.data, importe_solicitado: importe }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
