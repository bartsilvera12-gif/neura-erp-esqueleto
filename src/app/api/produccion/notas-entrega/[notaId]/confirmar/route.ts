import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { deltasDe, stockDeArticulo, type TipoMovimiento } from "@/lib/produccion/inventario-helper";

type Params = { params: Promise<{ notaId: string }> };

type Detalle = { id: string; articulo_tipo: "tablero" | "herraje"; articulo_id: string; descripcion: string | null; cantidad: number; unidad: string | null; condicion: string };

/** Tipo de movimiento de inventario que corresponde a una línea de la nota. */
function tipoMovimiento(notaTipo: string, condicion: string): TipoMovimiento {
  if (notaTipo === "devolucion") return condicion === "danada" ? "devolucion_danada" : "devolucion_aceptada";
  return "entrega_contratista";
}

/**
 * POST — confirma la nota. Genera un movimiento de inventario por cada línea
 * (entrega = salida; devolución = entrada buena/dañada) y marca la nota como
 * confirmada. En entrega no deja stock negativo. Al confirmar una entrega se
 * consumen las reservas activas del proyecto para ese artículo (best-effort).
 */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { notaId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;

    const nq = await sb.from("prod_notas_entrega").select("id, numero, proyecto_id, tipo, estado").eq("empresa_id", emp).eq("id", notaId).maybeSingle();
    if (nq.error || !nq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const nota = nq.data as { id: string; numero: string; proyecto_id: string; tipo: string; estado: string };
    if (nota.estado !== "borrador") return NextResponse.json(errorResponse("La nota ya fue confirmada o anulada."), { status: 400 });

    const dq = await sb.from("prod_nota_entrega_detalle").select("id, articulo_tipo, articulo_id, descripcion, cantidad, unidad, condicion").eq("empresa_id", emp).eq("nota_id", notaId);
    const lineas = (dq.data ?? []) as Detalle[];
    if (lineas.length === 0) return NextResponse.json(errorResponse("La nota no tiene líneas."), { status: 400 });

    // Pre-chequeo de stock para entregas: sumar la salida por artículo y validar.
    if (nota.tipo === "entrega") {
      const porArticulo = new Map<string, { tipo: "tablero" | "herraje"; id: string; total: number }>();
      for (const l of lineas) {
        const k = `${l.articulo_tipo}:${l.articulo_id}`;
        const e = porArticulo.get(k) ?? { tipo: l.articulo_tipo, id: l.articulo_id, total: 0 };
        e.total += Math.abs(Number(l.cantidad) || 0);
        porArticulo.set(k, e);
      }
      for (const { tipo, id, total } of porArticulo.values()) {
        const st = await stockDeArticulo(sb, emp, tipo, id);
        if (st.fisico - total < -1e-9 || st.utilizable - total < -1e-9) {
          return NextResponse.json(errorResponse(`No hay stock suficiente para entregar (${total} solicitado, físico ${st.fisico}).`), { status: 400 });
        }
      }
    }

    // Insertar los movimientos y vincularlos a cada línea.
    const insertados: string[] = [];
    for (const l of lineas) {
      const tipoMov = tipoMovimiento(nota.tipo, l.condicion);
      const cant = Math.abs(Number(l.cantidad) || 0);
      const { delta_fisico, delta_utilizable } = deltasDe(tipoMov, cant);
      const mv = await sb.from("prod_inventario_movimientos").insert({
        empresa_id: emp, articulo_tipo: l.articulo_tipo, articulo_id: l.articulo_id, tipo: tipoMov,
        cantidad: cant, delta_fisico, delta_utilizable, unidad: l.unidad,
        origen_tipo: "nota_entrega", origen_id: notaId, referencia: nota.numero,
        usuario_id: ctx.auth.usuarioCatalogId ?? null, usuario_nombre: ctx.auth.user?.email ?? null,
      }).select("id").single();
      if (mv.error) {
        // Rollback best-effort de lo ya insertado.
        if (insertados.length) { try { await sb.from("prod_inventario_movimientos").delete().eq("empresa_id", emp).in("id", insertados); } catch { /* best-effort */ } }
        return NextResponse.json(errorResponse(`No se pudo generar el movimiento: ${mv.error.message}`), { status: 400 });
      }
      const movId = (mv.data as { id: string }).id;
      insertados.push(movId);
      await sb.from("prod_nota_entrega_detalle").update({ movimiento_id: movId }).eq("empresa_id", emp).eq("id", l.id);
    }

    // Consumir reservas activas del proyecto para los artículos entregados (best-effort).
    if (nota.tipo === "entrega") {
      for (const l of lineas) {
        try {
          await sb.from("prod_inventario_reservas").update({ estado: "consumida", updated_at: new Date().toISOString() })
            .eq("empresa_id", emp).eq("proyecto_id", nota.proyecto_id).eq("articulo_tipo", l.articulo_tipo).eq("articulo_id", l.articulo_id).eq("estado", "activa");
        } catch { /* best-effort */ }
      }
    }

    const upd = await sb.from("prod_notas_entrega").update({
      estado: "confirmada", confirmada_por: ctx.auth.user?.email ?? null, confirmada_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("empresa_id", emp).eq("id", notaId);
    if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
    return NextResponse.json(successResponse({ id: notaId, estado: "confirmada" }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
