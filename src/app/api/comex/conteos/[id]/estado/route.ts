import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { getComexCtx, hoyPY, nombreUsuario, registrarHistorial, traerTodo } from "@/lib/comex/server";
import { moverStockDeposito } from "@/lib/comex/stock-deposito";

/**
 * POST { accion: cerrar | reabrir | anular | ajustar, motivo? }
 * - cerrar: termina el conteo (todos los productos contados).
 * - ajustar: SOLO ADMIN (INV-02/INV-03). Lleva el stock del sistema a lo contado,
 *   con un movimiento de inventario por producto y todo en el historial.
 */
export async function POST(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as { accion?: string; motivo?: string };
    const { data } = await ctx.supabase.from("inventario_conteos").select("id, numero, estado, ubicacion_id, ajustado_at").eq("empresa_id", emp).eq("id", id).maybeSingle();
    const c = data as { id: string; numero: string; estado: string; ubicacion_id: string | null; ajustado_at: string | null } | null;
    if (!c) return NextResponse.json(errorResponse("El conteo no existe."), { status: 404 });
    const esAdmin = esRolAdminEmpresaOGlobal(ctx.auth.rol);
    const motivo = String(b.motivo ?? "").trim();
    const items = await traerTodo<{ id: string; producto_id: string | null; producto_nombre: string; sku: string | null; stock_sistema: number; cantidad_fisica: number | null; motivo: string | null; ajustado: boolean }>((a, z) =>
      ctx.supabase
        .from("inventario_conteo_items")
        .select("id, producto_id, producto_nombre, sku, stock_sistema, cantidad_fisica, motivo, ajustado")
        .eq("empresa_id", emp)
        .eq("conteo_id", id)
        .order("id")
        .range(a, z)
    );
    const set = async (estado: string, extra: Record<string, unknown> = {}) => {
      const { error } = await ctx.supabase.from("inventario_conteos").update({ estado, updated_at: new Date().toISOString(), ...extra }).eq("empresa_id", emp).eq("id", id);
      if (error) throw new Error(error.message);
    };

    if (b.accion === "cerrar") {
      if (c.estado !== "en_curso") return NextResponse.json(errorResponse("El conteo no está en curso."), { status: 400 });
      const faltan = items.filter((i) => i.cantidad_fisica === null).length;
      if (faltan) return NextResponse.json(errorResponse(`Faltan contar ${faltan} producto(s). Si no hay ninguno, poné 0.`), { status: 400 });
      await set("cerrado", { cerrado_at: new Date().toISOString() });
      const dif = items.filter((i) => Number(i.cantidad_fisica) !== Number(i.stock_sistema)).length;
      await registrarHistorial(ctx.supabase, ctx.auth, "CONTEO", id, "CERRAR", { productos: items.length, con_diferencia: dif });
      return NextResponse.json(successResponse({ estado: "cerrado" }));
    }
    if (b.accion === "reabrir") {
      if (c.estado !== "cerrado" || c.ajustado_at) return NextResponse.json(errorResponse("Solo se reabre un conteo cerrado y sin ajustar."), { status: 400 });
      if (!motivo) return NextResponse.json(errorResponse("Escribí por qué se reabre."), { status: 400 });
      await set("en_curso", { cerrado_at: null });
      await registrarHistorial(ctx.supabase, ctx.auth, "CONTEO", id, "REABRIR", { motivo });
      return NextResponse.json(successResponse({ estado: "en_curso" }));
    }
    if (b.accion === "anular") {
      if (!esAdmin) return NextResponse.json(errorResponse("Solo un administrador puede anular un conteo."), { status: 403 });
      if (c.estado === "ajustado" || c.ajustado_at) return NextResponse.json(errorResponse("Un conteo ya ajustado no se anula."), { status: 400 });
      if (!motivo) return NextResponse.json(errorResponse("Escribí el motivo."), { status: 400 });
      await set("anulado");
      await registrarHistorial(ctx.supabase, ctx.auth, "CONTEO", id, "ANULAR", { motivo });
      return NextResponse.json(successResponse({ estado: "anulado" }));
    }
    if (b.accion === "ajustar") {
      if (!esAdmin) return NextResponse.json(errorResponse("Solo un administrador puede ajustar el stock."), { status: 403 });
      if (c.estado !== "cerrado") return NextResponse.json(errorResponse("Primero cerrá el conteo."), { status: 400 });
      const conDif = items.filter((i) => i.producto_id && !i.ajustado && Number(i.cantidad_fisica) !== Number(i.stock_sistema));
      const sinMotivo = conDif.filter((i) => !i.motivo);
      if (sinMotivo.length)
        return NextResponse.json(errorResponse(`Falta el motivo de la diferencia en: ${sinMotivo.map((i) => i.producto_nombre).slice(0, 5).join(", ")}${sinMotivo.length > 5 ? "…" : ""}.`), { status: 400 });

      // Se "reserva" el ajuste: si dos personas aprietan a la vez, solo uno lo aplica.
      const { data: claim, error: cErr } = await ctx.supabase
        .from("inventario_conteos")
        .update({ ajustado_at: new Date().toISOString(), ajustado_por_nombre: nombreUsuario(ctx.auth) })
        .eq("empresa_id", emp)
        .eq("id", id)
        .eq("estado", "cerrado")
        .is("ajustado_at", null)
        .select("id");
      if (cErr) throw new Error(cErr.message);
      if (!(claim ?? []).length) return NextResponse.json(errorResponse("Este conteo ya se está ajustando o ya se ajustó. Actualizá la pantalla."), { status: 409 });

      const ajustes: string[] = [];
      let enCurso: string | null = null;
      try {
        for (const i of conDif) {
          // Cada producto se marca antes de tocar el stock, para no ajustarlo dos veces.
          const { data: marca } = await ctx.supabase.from("inventario_conteo_items").update({ ajustado: true }).eq("empresa_id", emp).eq("id", i.id).eq("ajustado", false).select("id");
          if (!(marca ?? []).length) continue;
          enCurso = i.id;
          const { data: prod } = await ctx.supabase.from("productos").select("stock_actual, costo_promedio").eq("empresa_id", emp).eq("id", i.producto_id as string).maybeSingle();
          const pr = prod as { stock_actual: number; costo_promedio: number | null } | null;
          if (!pr) continue;
          // La diferencia contada se aplica sobre el stock de hoy (respeta ventas o compras desde el conteo).
          const nuevo = Math.max(0, Number(pr.stock_actual) + Number(i.cantidad_fisica) - Number(i.stock_sistema));
          const delta = nuevo - Number(pr.stock_actual);
          if (!delta) continue;
          const mov = await ctx.supabase.from("movimientos_inventario").insert({
            empresa_id: emp,
            producto_id: i.producto_id,
            producto_nombre: i.producto_nombre,
            producto_sku: i.sku,
            tipo: "AJUSTE",
            cantidad: delta,
            costo_unitario: Number(pr.costo_promedio) || 0,
            origen: "ajuste_manual",
            referencia: `Conteo ${c.numero}`,
            observacion: `Ajuste por conteo ${c.numero}: ${i.motivo}`.slice(0, 500),
            ubicacion_origen_id: c.ubicacion_id,
            fecha: hoyPY(),
            created_by: ctx.auth.user.id,
            usuario_nombre: nombreUsuario(ctx.auth),
          });
          if (mov.error) throw new Error(`${i.producto_nombre}: ${mov.error.message}`);
          const upd = await ctx.supabase.from("productos").update({ stock_actual: nuevo, updated_at: new Date().toISOString() }).eq("empresa_id", emp).eq("id", i.producto_id as string);
          if (upd.error) throw new Error(upd.error.message);
          if (c.ubicacion_id) await moverStockDeposito(ctx.supabase, emp, i.producto_id as string, c.ubicacion_id, delta);
          ajustes.push(`${i.producto_nombre}: ${Number(pr.stock_actual)} → ${nuevo} (${delta > 0 ? "+" : ""}${delta})`);
          enCurso = null;
        }
      } catch (e) {
        if (enCurso) await ctx.supabase.from("inventario_conteo_items").update({ ajustado: false }).eq("empresa_id", emp).eq("id", enCurso);
        // Se libera para poder reintentar; los productos ya ajustados quedan marcados y no se repiten.
        await ctx.supabase.from("inventario_conteos").update({ ajustado_at: null, ajustado_por_nombre: null }).eq("empresa_id", emp).eq("id", id);
        if (ajustes.length) await registrarHistorial(ctx.supabase, ctx.auth, "CONTEO", id, "AJUSTE_PARCIAL", { detalle: ajustes });
        throw e;
      }
      await set("ajustado");
      await registrarHistorial(ctx.supabase, ctx.auth, "CONTEO", id, "AJUSTAR_STOCK", { detalle: ajustes.length ? ajustes : ["Sin diferencias: no hubo que ajustar."] });
      return NextResponse.json(successResponse({ estado: "ajustado", ajustados: ajustes.length }));
    }
    return NextResponse.json(errorResponse("Acción inválida."), { status: 400 });
  } catch (err) {
    console.error("[/api/comex/conteos/:id/estado POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
