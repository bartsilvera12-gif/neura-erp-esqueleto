import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/reportes/cuentas-por-cobrar
 * Ventas a crédito con saldo pendiente (deuda de clientes).
 * Cobros aplicados salen de la tabla pagos con tipo cobro.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const sp = new URL(request.url).searchParams;

    let vq = ctx.supabase
      .from("ventas")
      .select("id, numero_control, cliente_id, moneda, total, tipo_venta, plazo_dias, fecha, estado")
      .eq("empresa_id", empresaId)
      .eq("tipo_venta", "CREDITO")
      .in("estado", ["completada", "pendiente"])
      .order("fecha", { ascending: false })
      .limit(1000);
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    if (desde) vq = vq.gte("fecha", desde);
    if (hasta) vq = vq.lte("fecha", `${hasta}T23:59:59.999Z`);
    const clienteId = sp.get("cliente_id");
    if (clienteId) vq = vq.eq("cliente_id", clienteId);
    const { data: ventas, error: eV } = await vq;
    if (eV) throw new Error(eV.message);

    const ids = (ventas ?? []).map((v) => (v as { id: string }).id);
    let cobrosPorVenta = new Map<string, number>();
    if (ids.length > 0) {
      const { data: cobros } = await ctx.supabase
        .from("pagos")
        .select("venta_id, monto")
        .eq("empresa_id", empresaId)
        .in("venta_id", ids);
      cobrosPorVenta = new Map();
      for (const c of (cobros ?? []) as Array<{ venta_id: string; monto: number | string }>) {
        cobrosPorVenta.set(c.venta_id, (cobrosPorVenta.get(c.venta_id) ?? 0) + Number(c.monto));
      }
    }

    let clientesMap = new Map<string, { nombre: string; ruc: string | null }>();
    const cliIds = Array.from(new Set((ventas ?? []).map((v) => (v as { cliente_id: string | null }).cliente_id).filter(Boolean))) as string[];
    if (cliIds.length > 0) {
      const { data: cli } = await ctx.supabase
        .from("clientes")
        .select("id, nombre, ruc")
        .eq("empresa_id", empresaId)
        .in("id", cliIds);
      clientesMap = new Map(
        (cli ?? []).map((c) => [
          (c as { id: string }).id,
          { nombre: (c as { nombre: string }).nombre, ruc: (c as { ruc: string | null }).ruc ?? null },
        ]),
      );
    }

    const today = new Date();
    const rows = (ventas ?? []).map((v) => {
      const r = v as {
        id: string;
        numero_control: string;
        cliente_id: string | null;
        moneda: string;
        total: number;
        plazo_dias: number | null;
        fecha: string;
      };
      const cobrado = cobrosPorVenta.get(r.id) ?? 0;
      const saldo = Number(r.total) - cobrado;
      const cli = r.cliente_id ? clientesMap.get(r.cliente_id) : null;
      let venceDias: number | null = null;
      let vencida = false;
      if (r.plazo_dias) {
        const venc = new Date(r.fecha);
        venc.setDate(venc.getDate() + r.plazo_dias);
        venceDias = Math.floor((venc.getTime() - today.getTime()) / 86400000);
        vencida = venceDias < 0;
      }
      return {
        venta_id: r.id,
        numero_control: r.numero_control,
        fecha: r.fecha,
        cliente: cli?.nombre ?? null,
        ruc: cli?.ruc ?? null,
        moneda: r.moneda,
        total: Number(r.total),
        cobrado,
        saldo,
        plazo_dias: r.plazo_dias,
        dias_para_vencer: venceDias,
        vencida,
      };
    }).filter((r) => r.saldo > 0);

    const totals = rows.reduce(
      (acc, r) => {
        acc.cantidad++;
        acc.total += r.total;
        acc.saldo += r.saldo;
        if (r.vencida) acc.vencido += r.saldo;
        else acc.por_vencer += r.saldo;
        return acc;
      },
      { cantidad: 0, total: 0, saldo: 0, vencido: 0, por_vencer: 0 },
    );

    return NextResponse.json(successResponse({ rows, totals }));
  } catch (err) {
    console.error("[/api/reportes/cuentas-por-cobrar GET]", err);
    return NextResponse.json(errorResponse("No se pudo cargar."), { status: 500 });
  }
}
