import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, operacionCerrada, registrarHistorial } from "@/lib/comex/server";
import { calcularCosteo, type ItemCosteo, type Prorrateo } from "@/lib/comex/costeo";
import { gastoEnGuaranies, type GastoComex } from "@/lib/comex/gastos";

const ITEM_COLS = "id, producto_id, producto_nombre, sku, cantidad, precio_unitario, moneda, subtotal, costo_final_gs, costo_aplicado_at";

/** Importación + ítems + gastos, que es todo lo que hace falta para costear. */
async function datos(ctx: NonNullable<Awaited<ReturnType<typeof getComexCtx>>>, id: string) {
  const emp = ctx.auth.empresa_id;
  const [imp, its, gas] = await Promise.all([
    ctx.supabase.from("importaciones").select("id, numero, estado, moneda, tipo_cambio, prorrateo_gastos").eq("empresa_id", emp).eq("id", id).maybeSingle(),
    ctx.supabase.from("importacion_items").select(ITEM_COLS).eq("empresa_id", emp).eq("importacion_id", id).order("created_at"),
    ctx.supabase.from("comex_gastos").select("monto, tipo_cambio").eq("empresa_id", emp).eq("origen_tipo", "IMPORTACION").eq("origen_id", id),
  ]);
  const cab = imp.data as { id: string; numero: string; estado: string; moneda: string; tipo_cambio: number; prorrateo_gastos: string } | null;
  if (!cab) return null;
  const items = (its.data ?? []) as unknown as ItemCosteo[];
  const gastosGs = ((gas.data ?? []) as Pick<GastoComex, "monto" | "tipo_cambio">[]).reduce((a, g) => a + gastoEnGuaranies(g), 0);
  return { cab, items, gastosGs };
}

/** GET — el costo de cada producto con los gastos ya repartidos. */
export async function GET(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const d = await datos(ctx, id);
    if (!d) return NextResponse.json(errorResponse("Importación no encontrada."), { status: 404 });

    const prorrateo = (d.cab.prorrateo_gastos === "cantidad" ? "cantidad" : "valor") as Prorrateo;
    const calc = calcularCosteo(d.items, { tipoCambio: Number(d.cab.tipo_cambio) || 1, gastosGs: d.gastosGs, prorrateo });
    return NextResponse.json(
      successResponse({
        ...calc,
        moneda: d.cab.moneda,
        tipo_cambio: Number(d.cab.tipo_cambio) || 1,
        prorrateo,
        cerrada: operacionCerrada(d.cab.estado),
      })
    );
  } catch (err) {
    console.error("[/api/importaciones/:id/costeo GET]", err);
    return NextResponse.json(errorResponse("No se pudo calcular el costo."), { status: 500 });
  }
}

/** PATCH { tipo_cambio?, prorrateo? } — cambia cómo se calcula. */
export async function PATCH(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.tipo_cambio !== undefined) {
      const tc = Number(b.tipo_cambio);
      if (!(tc > 0)) return NextResponse.json(errorResponse("El tipo de cambio tiene que ser mayor a 0."), { status: 400 });
      update.tipo_cambio = tc;
    }
    if (b.prorrateo !== undefined) {
      if (b.prorrateo !== "valor" && b.prorrateo !== "cantidad")
        return NextResponse.json(errorResponse("El reparto es por valor o por cantidad."), { status: 400 });
      update.prorrateo_gastos = b.prorrateo;
    }
    const { error } = await ctx.supabase.from("importaciones").update(update).eq("empresa_id", ctx.auth.empresa_id).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/importaciones/:id/costeo PATCH]", err);
    return NextResponse.json(errorResponse("No se pudo guardar."), { status: 500 });
  }
}

/**
 * POST — pasa el costo calculado al inventario: cada producto queda con ese
 * costo unitario. Los ítems sin producto del inventario se saltean.
 */
export async function POST(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const d = await datos(ctx, id);
    if (!d) return NextResponse.json(errorResponse("Importación no encontrada."), { status: 404 });
    if (operacionCerrada(d.cab.estado))
      return NextResponse.json(errorResponse("La importación está cerrada o anulada."), { status: 400 });

    const prorrateo = (d.cab.prorrateo_gastos === "cantidad" ? "cantidad" : "valor") as Prorrateo;
    const { filas } = calcularCosteo(d.items, { tipoCambio: Number(d.cab.tipo_cambio) || 1, gastosGs: d.gastosGs, prorrateo });

    const ahora = new Date().toISOString();
    const aplicados: string[] = [];
    const sinProducto: string[] = [];
    for (const f of filas) {
      const { error: eItem } = await ctx.supabase
        .from("importacion_items")
        .update({ costo_final_gs: f.costo_unitario_gs, costo_aplicado_at: ahora })
        .eq("empresa_id", emp)
        .eq("id", f.id);
      if (eItem) throw new Error(eItem.message);
      if (!f.producto_id) {
        sinProducto.push(f.producto_nombre);
        continue;
      }
      const { error: eProd } = await ctx.supabase
        .from("productos")
        .update({ costo_promedio: f.costo_unitario_gs, updated_at: ahora })
        .eq("empresa_id", emp)
        .eq("id", f.producto_id);
      if (eProd) throw new Error(eProd.message);
      aplicados.push(f.producto_nombre);
    }

    await registrarHistorial(ctx.supabase, ctx.auth, "IMPORTACION", id, "APLICAR_COSTO", {
      productos: aplicados.length,
      gastos_gs: d.gastosGs,
      prorrateo,
    });
    return NextResponse.json(successResponse({ aplicados: aplicados.length, sin_producto: sinProducto }));
  } catch (err) {
    console.error("[/api/importaciones/:id/costeo POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "No se pudo aplicar el costo."), { status: 500 });
  }
}
