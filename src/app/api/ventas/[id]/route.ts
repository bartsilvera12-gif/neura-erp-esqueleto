import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * DELETE /api/ventas/:id — anula una venta y repone el stock.
 * Regla mínima: solo permite eliminar ventas del propio usuario o de un admin.
 * No emite comprobante fiscal; para SIFEN habría que emitir nota de crédito.
 */
export async function DELETE(request: NextRequest, ctxP: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxP.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;

    // Traer venta e ítems para reponer stock
    const { data: venta, error: eV } = await ctx.supabase
      .from("ventas")
      .select("id, estado")
      .eq("empresa_id", empresaId)
      .eq("id", id)
      .maybeSingle();
    if (eV) throw new Error(eV.message);
    if (!venta) return NextResponse.json(errorResponse("Venta no encontrada."), { status: 404 });

    const { data: items } = await ctx.supabase
      .from("ventas_items")
      .select("producto_id, cantidad")
      .eq("empresa_id", empresaId)
      .eq("venta_id", id);

    // Reponer stock por cada línea (solo si tenía producto_id)
    for (const it of (items ?? []) as Array<{ producto_id: string | null; cantidad: number }>) {
      if (!it.producto_id) continue;
      const cantidad = Number(it.cantidad) || 0;
      if (cantidad <= 0) continue;
      // Traer stock actual
      const { data: p } = await ctx.supabase
        .from("productos")
        .select("stock_actual")
        .eq("empresa_id", empresaId)
        .eq("id", it.producto_id)
        .maybeSingle();
      if (p) {
        const nuevo = Number((p as { stock_actual: number }).stock_actual ?? 0) + cantidad;
        await ctx.supabase
          .from("productos")
          .update({ stock_actual: nuevo })
          .eq("empresa_id", empresaId)
          .eq("id", it.producto_id);
      }
    }

    // Borrar movimientos de inventario ligados a la venta (best-effort)
    await ctx.supabase
      .from("movimientos_inventario")
      .delete()
      .eq("empresa_id", empresaId)
      .eq("venta_id", id);

    // Borrar ítems y venta
    await ctx.supabase.from("ventas_items").delete().eq("empresa_id", empresaId).eq("venta_id", id);
    const { error: eDel } = await ctx.supabase.from("ventas").delete().eq("empresa_id", empresaId).eq("id", id);
    if (eDel) throw new Error(eDel.message);

    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/ventas/:id DELETE]", err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "No se pudo eliminar la venta."),
      { status: 500 },
    );
  }
}
