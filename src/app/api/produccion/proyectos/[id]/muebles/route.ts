import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type Params = { params: Promise<{ id: string }> };

/** POST /api/produccion/proyectos/[id]/muebles — agrega un mueble/partida. */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const descripcion = String(b.descripcion ?? "").trim();
    if (!descripcion) return NextResponse.json(errorResponse("La descripción del mueble es obligatoria."), { status: 400 });
    const cantidad = Number(b.cantidad); if (!(cantidad > 0)) return NextResponse.json(errorResponse("La cantidad debe ser mayor a 0."), { status: 400 });

    const pq = await ctx.supabase.from("prod_proyectos").select("id").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (pq.error || !pq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const ins = await ctx.supabase.from("prod_proyecto_muebles").insert({
      empresa_id: emp, proyecto_id: id,
      codigo: String(b.codigo ?? "").trim() || null,
      descripcion, cantidad,
      estado: String(b.estado ?? "pendiente").trim() || "pendiente",
      observaciones: String(b.observaciones ?? "").trim() || null,
    }).select("id").single();
    if (ins.error) return NextResponse.json(errorResponse(ins.error.message), { status: 400 });
    return NextResponse.json(successResponse({ mueble: ins.data }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
