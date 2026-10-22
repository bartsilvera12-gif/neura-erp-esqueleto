import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { presupuestoEditable, recomputarTotalPresupuesto } from "@/lib/produccion/presupuestos-helper";

type Params = { params: Promise<{ presId: string }> };
const TIPOS = ["tablero", "herraje", "contratista", "otro"];

/** POST — agrega una línea al presupuesto (solo en borrador). */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { presId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;

    const ed = await presupuestoEditable(sb, emp, presId);
    if ("error" in ed) return NextResponse.json(errorResponse(ed.error), { status: 400 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const descripcion = String(b.descripcion ?? "").trim();
    if (!descripcion) return NextResponse.json(errorResponse("La descripción es obligatoria."), { status: 400 });
    const cantidad = Number(b.cantidad) || 0;
    const costo = Number(b.costo_unitario) || 0;
    const tipo = TIPOS.includes(String(b.tipo_costo)) ? String(b.tipo_costo) : "otro";

    const ins = await sb.from("prod_presupuesto_lineas").insert({
      empresa_id: emp, presupuesto_id: presId, tipo_costo: tipo,
      articulo_id: b.articulo_id ? String(b.articulo_id) : null,
      descripcion, unidad: String(b.unidad ?? "").trim() || null,
      cantidad, costo_unitario: costo, subtotal: Math.round(cantidad * costo * 100) / 100,
      observaciones: String(b.observaciones ?? "").trim() || null,
    }).select("id").single();
    if (ins.error) return NextResponse.json(errorResponse(ins.error.message), { status: 400 });
    const total = await recomputarTotalPresupuesto(sb, emp, presId);
    return NextResponse.json(successResponse({ linea: ins.data, total }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
