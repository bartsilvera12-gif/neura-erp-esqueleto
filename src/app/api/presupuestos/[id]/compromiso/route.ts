import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { cabeceraDoc, esc, fechaDoc, filasVacias, paginaDoc } from "@/lib/documentos/formato";
import { numeroALetras } from "@/lib/facturas-exportacion/numero-a-letras";
import { NOMBRE_MONEDA } from "@/lib/facturas-exportacion/config";

/**
 * GET /api/presupuestos/[id]/compromiso?auto=1
 * El presupuesto impreso como COMPROMISO DE VENTAS (la proforma de Living Room).
 * Documento interno NO fiscal.
 */
export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParams.params;
  const auto = new URL(request.url).searchParams.get("auto") === "1";
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new NextResponse("No autorizado", { status: 401 });
  const emp = ctx.auth.empresa_id;

  const pq = await ctx.supabase.from("presupuestos").select("*").eq("empresa_id", emp).eq("id", id).maybeSingle();
  if (pq.error || !pq.data) return new NextResponse("Compromiso de venta no encontrado", { status: 404 });
  const p = pq.data as Record<string, unknown>;
  const itq = await ctx.supabase
    .from("presupuesto_items")
    .select("producto_nombre, sku, cantidad, precio_unitario, total")
    .eq("empresa_id", emp)
    .eq("presupuesto_id", id)
    .order("created_at", { ascending: true });
  const items = (itq.data ?? []) as Record<string, unknown>[];

  // Vendedor: quien cargó el compromiso.
  let vendedor = "";
  let celVendedor = "";
  if (p.created_by_user_id) {
    const uq = await ctx.supabase.from("usuarios").select("*").eq("id", String(p.created_by_user_id)).maybeSingle();
    const u = (uq.data ?? null) as Record<string, unknown> | null;
    vendedor = String(u?.nombre ?? u?.email ?? "");
    celVendedor = String(u?.telefono ?? u?.celular ?? "");
  }

  const moneda = String(p.moneda ?? "PYG");
  const num = (n: unknown) => (Number(n) || 0).toLocaleString("es-PY", { maximumFractionDigits: moneda === "PYG" ? 0 : 2 });
  const numero = `CV -   ${String(p.numero_control ?? "").replace(/\D/g, "").padStart(7, "0")}`;

  const cuerpo = `
  ${cabeceraDoc({ titulo: "COMPROMISO DE VENTAS", numero, conLogo: false })}
  <div class="box pad dos">
    <div>
      <div class="fila"><span class="l" style="flex-basis:80px">Fecha:</span><span>${fechaDoc(p.fecha)}</span></div>
      <div class="fila"><span class="l" style="flex-basis:80px">Cliente:</span><span>${esc(String(p.cliente_nombre ?? "").toUpperCase())}</span></div>
      <div class="fila"><span class="l" style="flex-basis:80px">RUC / C.I</span><span>${esc(p.cliente_ruc)}</span></div>
      <div class="fila"><span class="l" style="flex-basis:80px">Dirección:</span><span>${esc(p.cliente_direccion)}</span></div>
    </div>
    <div>
      <div class="fila"><span class="l">Vendedor:</span><span>${esc(vendedor.toUpperCase())}</span></div>
      <div class="fila"><span class="l">Cel. Vendedor:</span><span>${esc(celVendedor)}</span></div>
      <div class="fila"><span class="l">Plazo de entrega:</span><span>${esc(p.plazo_entrega)}</span></div>
      <div class="fila"><span class="l">Moneda:</span><span>${esc(NOMBRE_MONEDA[moneda] ?? moneda)}</span></div>
    </div>
  </div>
  <table class="g">
    <thead><tr><th style="width:90px">Código</th><th style="width:70px">Cantidad</th><th>Descripción</th><th style="width:90px">Unitario</th><th style="width:95px">Total</th></tr></thead>
    <tbody>
      ${items.map((it) => `<tr><td class="c">${esc(it.sku)}</td><td class="c">${num(it.cantidad)}</td><td>${esc(it.producto_nombre)}</td><td class="r">${num(it.precio_unitario)}</td><td class="r">${num(it.total)}</td></tr>`).join("")}
      ${filasVacias(Math.max(1, 26 - items.length), 5)}
    </tbody>
    <tfoot><tr><th style="text-align:left">Total</th><th colspan="3" style="text-align:left;text-transform:uppercase">&nbsp;&nbsp;${esc(numeroALetras(Number(p.total) || 0))}</th><th class="r" style="text-align:right">${num(p.total)}</th></tr></tfoot>
  </table>
  ${p.observaciones ? `<div class="box pad" style="margin-top:3px">Observaciones: ${esc(p.observaciones)}</div>` : ""}
  <div class="box firmas" style="margin-top:6px;padding-top:44px">
    <div class="ln"><span>FIRMA DEL CLIENTE:</span><i></i></div><div class="ln"><span>FIRMA DEL VENDEDOR:</span><i></i></div>
    <div class="ln"><span>ACLARACION DE FIRMA:</span><i></i></div><div class="ln"><span>ACLARACION DE FIRMA:</span><i></i></div>
    <div class="ln"><span>DOCUMENTO Nº:</span><i></i></div><div class="ln"><span>DOCUMENTO Nº:</span><i></i></div>
  </div>`;
  return new NextResponse(paginaDoc(`Compromiso de venta ${p.numero_control ?? ""}`, cuerpo, auto), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
