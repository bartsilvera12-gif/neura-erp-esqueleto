import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { CATEGORIAS_GASTO, type CategoriaGasto } from "@/lib/produccion/gastos-helper";

type Params = { params: Promise<{ gastoId: string }> };

/** PUT — edita un gasto. */
export async function PUT(request: NextRequest, p: Params) {
  try {
    const { gastoId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.concepto !== undefined) { const c = String(b.concepto).trim(); if (!c) return NextResponse.json(errorResponse("El concepto es obligatorio."), { status: 400 }); patch.concepto = c; }
    if (b.categoria !== undefined) patch.categoria = (CATEGORIAS_GASTO.includes(String(b.categoria) as CategoriaGasto) ? String(b.categoria) : "otro");
    if (b.proveedor_id !== undefined) patch.proveedor_id = String(b.proveedor_id ?? "").trim() || null;
    if (b.proveedor_nombre !== undefined) patch.proveedor_nombre = String(b.proveedor_nombre ?? "").trim() || null;
    if (b.fecha !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha))) patch.fecha = String(b.fecha);
    if (b.cantidad !== undefined) patch.cantidad = Number(b.cantidad) || 0;
    if (b.costo_unitario !== undefined) patch.costo_unitario = Number(b.costo_unitario) || 0;
    if (b.monto !== undefined) patch.monto = Number(b.monto) || 0;
    if (b.comprobante_numero !== undefined) patch.comprobante_numero = String(b.comprobante_numero ?? "").trim() || null;
    if (b.tiene_comprobante !== undefined) patch.tiene_comprobante = b.tiene_comprobante === true;
    if (b.aprobado !== undefined) patch.aprobado = b.aprobado !== false;
    if (b.observaciones !== undefined) patch.observaciones = String(b.observaciones ?? "").trim() || null;

    const upd = await ctx.supabase.from("prod_gastos").update(patch).eq("empresa_id", emp).eq("id", gastoId);
    if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id: gastoId }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** DELETE — borra un gasto. */
export async function DELETE(request: NextRequest, p: Params) {
  try {
    const { gastoId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const del = await ctx.supabase.from("prod_gastos").delete().eq("empresa_id", ctx.auth.empresa_id).eq("id", gastoId);
    if (del.error) return NextResponse.json(errorResponse(del.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id: gastoId }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
