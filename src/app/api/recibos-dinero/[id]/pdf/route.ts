import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { cabeceraDoc, esc, fechaDoc, paginaDoc } from "@/lib/documentos/formato";
import { numeroALetras } from "@/lib/facturas-exportacion/numero-a-letras";
import { NOMBRE_MONEDA } from "@/lib/facturas-exportacion/config";

/**
 * GET /api/recibos-dinero/[id]/pdf?auto=1
 * Recibo de dinero imprimible (HTML), con el formato del talonario de Living Room.
 * Documento interno NO fiscal.
 */
const num = (n: unknown, moneda: string) => (Number(n) || 0).toLocaleString("es-PY", { maximumFractionDigits: moneda === "PYG" ? 0 : 2 });

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParams.params;
  const auto = new URL(request.url).searchParams.get("auto") === "1";
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new NextResponse("No autorizado", { status: 401 });
  const emp = ctx.auth.empresa_id;

  const rq = await ctx.supabase.from("recibos_dinero").select("*").eq("empresa_id", emp).eq("id", id).maybeSingle();
  if (rq.error || !rq.data) return new NextResponse("Recibo no encontrado", { status: 404 });
  const r = rq.data as Record<string, unknown>;
  const moneda = String(r.moneda ?? "PYG");
  const monto = Number(r.monto) || 0;

  // Total de la factura / venta y saldo, cuando el recibo viene de una venta o de un cobro.
  let totalFactura: number | null = null;
  let saldo: number | null = null;
  if (r.cuenta_por_cobrar_id) {
    const c = await ctx.supabase.from("cuentas_por_cobrar").select("*").eq("empresa_id", emp).eq("id", String(r.cuenta_por_cobrar_id)).maybeSingle();
    const cta = (c.data ?? null) as Record<string, unknown> | null;
    if (cta) {
      saldo = Number(cta.saldo) || 0;
      const t = Number(cta.monto_total ?? cta.total ?? cta.monto);
      if (Number.isFinite(t) && t > 0) totalFactura = t;
    }
  }
  if (totalFactura === null && r.venta_id) {
    const v = await ctx.supabase.from("ventas").select("total").eq("empresa_id", emp).eq("id", String(r.venta_id)).maybeSingle();
    const t = Number((v.data as { total?: number } | null)?.total);
    if (Number.isFinite(t) && t > 0) {
      totalFactura = t;
      if (saldo === null && r.origen === "venta_contado") saldo = 0;
    }
  }
  // Cobro de un compromiso de venta: total del compromiso y lo que queda.
  if (r.presupuesto_id) {
    const [pq, rq2] = await Promise.all([
      ctx.supabase.from("presupuestos").select("total").eq("empresa_id", emp).eq("id", String(r.presupuesto_id)).maybeSingle(),
      ctx.supabase.from("recibos_dinero").select("monto, fecha, created_at").eq("empresa_id", emp).eq("presupuesto_id", String(r.presupuesto_id)).eq("anulado", false),
    ]);
    const t = Number((pq.data as { total?: number } | null)?.total);
    if (Number.isFinite(t) && t > 0) {
      totalFactura = t;
      const cobrado = ((rq2.data ?? []) as { monto: number | null }[]).reduce((a, x) => a + (Number(x.monto) || 0), 0);
      saldo = Math.max(0, t - cobrado);
    }
  }
  // Recibo suelto (sin venta ni cuenta): el saldo es lo que el cliente sigue
  // debiendo en total, que es lo que pidió ver la clienta en el recibo.
  if (saldo === null && r.cliente_id) {
    const ctas = await ctx.supabase
      .from("cuentas_por_cobrar")
      .select("saldo")
      .eq("empresa_id", emp)
      .eq("cliente_id", String(r.cliente_id));
    const filas = (ctas.data ?? []) as { saldo: number | null }[];
    if (filas.length) saldo = filas.reduce((a, c) => a + (Number(c.saldo) || 0), 0);
  }
  // Sin nada a qué referirse, el recibo se cobra entero: total = monto, saldo 0.
  if (totalFactura === null) totalFactura = monto;
  if (saldo === null) saldo = 0;
  const telQ = r.cliente_id ? await ctx.supabase.from("clientes").select("telefono").eq("empresa_id", emp).eq("id", String(r.cliente_id)).maybeSingle() : null;
  const telefono = (telQ?.data as { telefono?: string | null } | null)?.telefono ?? "";

  const numero = String(r.numero_recibo ?? "").replace(/^REC-0*/, "RBO - ");
  const cuerpo = `
  ${cabeceraDoc({ titulo: "RECIBO DE DINERO", numero: `N°: ${numero}`, conActividad: false })}
  <div class="box pad" style="display:flex;justify-content:space-between;gap:16px">
    <div style="flex:1">
      <div class="fila"><span class="l">Fecha:</span><span>${fechaDoc(r.fecha)}</span></div>
      <div class="fila"><span class="l">Cliente:</span><span>${esc(r.cliente_nombre)}</span></div>
      <div class="fila"><span class="l">Teléfono:</span><span>${esc(telefono)}</span></div>
      <div class="fila"><span class="l">Vendedor:</span><span>${esc(r.usuario_nombre)}</span></div>
    </div>
    <div style="align-self:flex-end">
      <div class="fila"><span style="width:44px">Gs.</span><span class="box" style="width:150px;padding:2px 8px;margin:0">${moneda === "PYG" ? num(monto, "PYG") : "0"}</span></div>
      <div class="fila"><span style="width:44px">USD.:</span><span class="box" style="width:150px;padding:2px 8px;margin:0">${moneda === "USD" ? num(monto, "USD") : "0"}</span></div>
    </div>
  </div>
  <div class="box pad">
    <div class="fila"><span class="l">Recibimos de</span><span>${esc(r.cliente_nombre)}</span></div>
    <div class="fila"><span class="l">R.U.C. Nº</span><span>${esc(r.cliente_documento)}</span></div>
    <div class="fila"><span class="l">la cantidad de:</span><span>${esc(NOMBRE_MONEDA[moneda] ?? moneda)} &nbsp;&nbsp;&nbsp; ${esc(numeroALetras(monto))}</span></div>
    <div class="fila" style="min-height:64px"><span class="l">por concepto de:</span><span>${esc(String(r.concepto ?? "").toUpperCase())}${r.referencia ? ` · Ref. ${esc(r.referencia)}` : ""}${r.anulado ? " · <strong>ANULADO</strong>" : ""}</span></div>
    <div class="dos">
      <div>
        <div class="fila"><span class="l" style="flex-basis:100px">Fecha Emisión:</span><span>${fechaDoc(r.fecha)}</span></div>
      </div>
      <div>
        <div class="fila"><span class="l" style="flex-basis:100px">Total Factura:</span><span>${num(totalFactura, moneda)}</span></div>
        <div class="fila"><span class="l" style="flex-basis:100px">Cobrado:</span><span>${num(monto, moneda)}</span></div>
        <div class="fila"><span class="l" style="flex-basis:100px">Saldo:</span><span>${num(saldo, moneda)}</span></div>
      </div>
    </div>
  </div>
  <div class="box" style="display:grid;grid-template-columns:1fr 1fr;padding:46px 30px 8px;text-align:center;column-gap:60px">
    <div style="border-top:1px dotted #000;padding-top:4px">FIRMA DEL CLIENTE</div>
    <div style="border-top:1px dotted #000;padding-top:4px">FIRMA DEL VENDEDOR</div>
  </div>`;
  return new NextResponse(paginaDoc(`${r.numero_recibo} — Recibo de dinero`, cuerpo, auto), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
