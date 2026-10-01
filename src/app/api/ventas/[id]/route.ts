import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { anularVentaCompleta } from "@/lib/ventas/server/anular-venta";

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

    // Una venta con factura emitida no se borra suelta: hay que anular la
    // factura, y eso deshace la venta (son el mismo hecho).
    const { data: fac } = await ctx.supabase
      .from("facturas_exportacion")
      .select("numero_formateado")
      .eq("empresa_id", empresaId)
      .eq("venta_id", id)
      .eq("estado", "EMITIDA")
      .maybeSingle();
    if (fac)
      return NextResponse.json(
        errorResponse(`Esta venta tiene la factura ${(fac as { numero_formateado: string }).numero_formateado} emitida. Anulá la factura desde Facturación: eso devuelve el stock y la plata.`),
        { status: 409 }
      );

    const r = await anularVentaCompleta(ctx.supabase, empresaId, id);
    if (!r.ok) return NextResponse.json(errorResponse(r.error), { status: r.error === "Venta no encontrada." ? 404 : 500 });

    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/ventas/:id DELETE]", err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "No se pudo eliminar la venta."),
      { status: 500 },
    );
  }
}

const METODOS = new Set(["efectivo", "transferencia", "tarjeta", "qr", "billetera", "otro"]);

/** GET /api/ventas/:id — datos editables de la venta: observaciones y formas de pago. */
export async function GET(request: NextRequest, ctxP: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxP.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const [v, p] = await Promise.all([
      ctx.supabase.from("ventas").select("id, numero_control, total, observaciones, metodo_pago").eq("empresa_id", emp).eq("id", id).maybeSingle(),
      ctx.supabase.from("ventas_pagos_detalle").select("metodo_pago, monto, entidad_bancaria_id, referencia").eq("empresa_id", emp).eq("venta_id", id).order("created_at", { ascending: true }),
    ]);
    if (v.error) throw new Error(v.error.message);
    if (!v.data) return NextResponse.json(errorResponse("Venta no encontrada."), { status: 404 });
    return NextResponse.json(successResponse({ venta: v.data, pagos: p.data ?? [] }));
  } catch (err) {
    console.error("[/api/ventas/:id GET]", err);
    return NextResponse.json(errorResponse("No se pudo cargar la venta."), { status: 500 });
  }
}

/**
 * PATCH /api/ventas/:id { observaciones?, pagos?: [{ metodo_pago, monto, entidad_bancaria_id?, referencia? }] }
 * Corrige una venta ya generada SIN tocar productos, totales ni stock: solo las
 * observaciones y cómo se cobró (p. ej. parte en efectivo y parte por transferencia).
 * Para cambiar productos o cantidades hay que eliminar la venta y hacerla de nuevo.
 */
export async function PATCH(request: NextRequest, ctxP: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxP.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as { observaciones?: unknown; pagos?: unknown };

    const vQ = await ctx.supabase.from("ventas").select("id, total, estado").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (vQ.error) throw new Error(vQ.error.message);
    const venta = vQ.data as { id: string; total: number; estado: string | null } | null;
    if (!venta) return NextResponse.json(errorResponse("Venta no encontrada."), { status: 404 });
    if (venta.estado === "anulada") return NextResponse.json(errorResponse("La venta está anulada."), { status: 400 });

    const upd: Record<string, unknown> = {};
    if (b.observaciones !== undefined) upd.observaciones = String(b.observaciones ?? "").trim().slice(0, 1000) || null;

    if (Array.isArray(b.pagos)) {
      const pagos = (b.pagos as Record<string, unknown>[])
        .map((p) => ({
          metodo_pago: String(p.metodo_pago ?? ""),
          monto: Math.round((Number(p.monto) || 0) * 100) / 100,
          entidad_bancaria_id: p.entidad_bancaria_id ? String(p.entidad_bancaria_id) : null,
          referencia: String(p.referencia ?? "").trim().slice(0, 80) || null,
        }))
        .filter((p) => p.monto > 0);
      if (!pagos.length) return NextResponse.json(errorResponse("Cargá al menos una forma de pago."), { status: 400 });
      if (pagos.some((p) => !METODOS.has(p.metodo_pago))) return NextResponse.json(errorResponse("Forma de pago inválida."), { status: 400 });
      const suma = pagos.reduce((s, p) => s + p.monto, 0);
      if (Math.abs(suma - Number(venta.total)) > 0.5)
        return NextResponse.json(errorResponse(`Los pagos suman ${suma.toLocaleString("es-PY")} y el total de la venta es ${Number(venta.total).toLocaleString("es-PY")}.`), { status: 400 });

      const ids = pagos.map((p) => p.entidad_bancaria_id).filter(Boolean) as string[];
      const nombres = new Map<string, string>();
      if (ids.length) {
        const eQ = await ctx.supabase.from("entidades_bancarias").select("id, nombre").eq("empresa_id", emp).in("id", ids);
        for (const e of (eQ.data ?? []) as { id: string; nombre: string }[]) nombres.set(e.id, e.nombre);
        if (ids.some((x) => !nombres.has(x))) return NextResponse.json(errorResponse("Alguna entidad / banco no existe."), { status: 400 });
      }

      // Se reemplazan las formas de pago; si el alta falla se vuelven a poner las anteriores.
      const prev = await ctx.supabase.from("ventas_pagos_detalle").select("*").eq("empresa_id", emp).eq("venta_id", id);
      if (prev.error) throw new Error(prev.error.message);
      const del = await ctx.supabase.from("ventas_pagos_detalle").delete().eq("empresa_id", emp).eq("venta_id", id);
      if (del.error) throw new Error(del.error.message);
      const ins = await ctx.supabase.from("ventas_pagos_detalle").insert(
        pagos.map((p) => ({
          empresa_id: emp,
          venta_id: id,
          metodo_pago: p.metodo_pago,
          monto: p.monto,
          entidad_bancaria_id: p.entidad_bancaria_id,
          entidad_nombre_snapshot: p.entidad_bancaria_id ? nombres.get(p.entidad_bancaria_id) ?? null : null,
          referencia: p.referencia,
        }))
      );
      if (ins.error) {
        if ((prev.data ?? []).length) await ctx.supabase.from("ventas_pagos_detalle").insert(prev.data as Record<string, unknown>[]);
        throw new Error(ins.error.message);
      }
      // La columna de la venta guarda un solo método (igual que al crearla).
      const unico = pagos.length === 1 ? pagos[0].metodo_pago : null;
      upd.metodo_pago = unico === "tarjeta" || unico === "transferencia" ? unico : "efectivo";
    }

    if (Object.keys(upd).length) {
      const { error } = await ctx.supabase.from("ventas").update(upd).eq("empresa_id", emp).eq("id", id);
      if (error) throw new Error(error.message);
    }
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/ventas/:id PATCH]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "No se pudo guardar la venta."), { status: 500 });
  }
}
