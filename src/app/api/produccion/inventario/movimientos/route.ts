import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { deltasDe, stockDeArticulo, TIPOS_MOVIMIENTO, type ArticuloTipo, type TipoMovimiento } from "@/lib/produccion/inventario-helper";

const ORIGEN: Record<string, string> = {
  recepcion_compra: "compra", entrega_contratista: "nota_entrega", devolucion_aceptada: "devolucion",
  devolucion_danada: "devolucion", ajuste_conteo: "conteo", reverso: "reverso",
};

/**
 * POST /api/produccion/inventario/movimientos — registra un movimiento.
 * El libro es inmutable: para corregir se usa un ajuste o un reverso.
 * Body: { articulo_tipo, articulo_id, tipo, cantidad, salida?, unidad?, ubicacion?,
 *         referencia?, motivo?, costo_unitario?, origen_id?, reverso_de? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const articulo_tipo = String(b.articulo_tipo) as ArticuloTipo;
    if (articulo_tipo !== "tablero" && articulo_tipo !== "herraje") return NextResponse.json(errorResponse("Tipo de artículo inválido."), { status: 400 });
    const articulo_id = String(b.articulo_id ?? "").trim();
    if (!articulo_id) return NextResponse.json(errorResponse("Falta el artículo."), { status: 400 });
    const tipo = String(b.tipo) as TipoMovimiento;
    if (!TIPOS_MOVIMIENTO.includes(tipo)) return NextResponse.json(errorResponse("Tipo de movimiento inválido."), { status: 400 });

    // Ajuste y reverso obligan a motivo (spec 5.5).
    const motivo = String(b.motivo ?? "").trim() || null;
    if ((tipo === "ajuste_conteo" || tipo === "reverso") && !motivo) return NextResponse.json(errorResponse("El ajuste y el reverso requieren un motivo."), { status: 400 });

    let delta_fisico: number, delta_utilizable: number, cantidad: number;
    let reverso_de: string | null = null;

    if (tipo === "reverso") {
      reverso_de = String(b.reverso_de ?? "").trim();
      if (!reverso_de) return NextResponse.json(errorResponse("Falta el movimiento a reversar."), { status: 400 });
      const orig = await sb.from("prod_inventario_movimientos").select("delta_fisico, delta_utilizable, cantidad, reverso_de").eq("empresa_id", emp).eq("id", reverso_de).maybeSingle();
      if (orig.error || !orig.data) return NextResponse.json(errorResponse("No se encontró el movimiento a reversar."), { status: 404 });
      const od = orig.data as { delta_fisico: number; delta_utilizable: number; cantidad: number; reverso_de: string | null };
      if (od.reverso_de) return NextResponse.json(errorResponse("No se puede reversar un reverso."), { status: 400 });
      // Evitar doble reverso del mismo movimiento.
      const ya = await sb.from("prod_inventario_movimientos").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("reverso_de", reverso_de);
      if ((ya.count ?? 0) > 0) return NextResponse.json(errorResponse("Ese movimiento ya fue reversado."), { status: 400 });
      delta_fisico = -Number(od.delta_fisico) || 0;
      delta_utilizable = -Number(od.delta_utilizable) || 0;
      cantidad = Number(od.cantidad) || 0;
    } else {
      cantidad = Math.abs(Number(b.cantidad) || 0);
      if (cantidad <= 0) return NextResponse.json(errorResponse("La cantidad debe ser mayor que cero."), { status: 400 });
      const d = deltasDe(tipo, cantidad, b.salida === true);
      delta_fisico = d.delta_fisico; delta_utilizable = d.delta_utilizable;
    }

    // No permitir stock negativo por defecto (spec 5.5.1): ni físico ni utilizable.
    const st = await stockDeArticulo(sb, emp, articulo_tipo, articulo_id);
    if (st.fisico + delta_fisico < -1e-9 || st.utilizable + delta_utilizable < -1e-9) {
      return NextResponse.json(errorResponse(`El movimiento dejaría el stock en negativo (físico actual ${st.fisico}). No está permitido.`), { status: 400 });
    }

    const ins = await sb.from("prod_inventario_movimientos").insert({
      empresa_id: emp, articulo_tipo, articulo_id, tipo, cantidad, delta_fisico, delta_utilizable,
      unidad: String(b.unidad ?? "").trim() || null,
      ubicacion: String(b.ubicacion ?? "").trim() || null,
      origen_tipo: ORIGEN[tipo] ?? "manual",
      origen_id: b.origen_id ? String(b.origen_id) : null,
      referencia: String(b.referencia ?? "").trim() || null,
      motivo,
      costo_unitario: b.costo_unitario === "" || b.costo_unitario == null ? null : Number(b.costo_unitario),
      reverso_de,
      usuario_id: ctx.auth.usuarioCatalogId ?? null,
      usuario_nombre: ctx.auth.user?.email ?? null,
    }).select("id").single();
    if (ins.error) return NextResponse.json(errorResponse(ins.error.message), { status: 400 });

    const nuevo = await stockDeArticulo(sb, emp, articulo_tipo, articulo_id);
    return NextResponse.json(successResponse({ movimiento: ins.data, stock: nuevo }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
