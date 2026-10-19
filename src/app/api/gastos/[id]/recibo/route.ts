import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { cabeceraDoc, esc, fechaDoc, paginaDoc } from "@/lib/documentos/formato";

/**
 * GET /api/gastos/[id]/recibo?auto=1
 * "Recibo de Gasto" imprimible para gastos sin factura (con su cuenta contable).
 */
export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParams.params;
  const auto = new URL(request.url).searchParams.get("auto") === "1";
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new NextResponse("No autorizado", { status: 401 });
  const { supabase, auth } = ctx;

  const gq = await supabase.from("gastos").select("*").eq("empresa_id", auth.empresa_id).eq("id", id).maybeSingle();
  if (gq.error || !gq.data) return new NextResponse("Gasto no encontrado", { status: 404 });
  const g = gq.data as Record<string, unknown>;

  // Cuenta contable (código + nombre)
  let cuentaTxt = "";
  if (g.cuenta_contable_id) {
    const cq = await supabase.from("plan_cuentas").select("cuenta, denominacion").eq("empresa_id", auth.empresa_id).eq("id", String(g.cuenta_contable_id)).maybeSingle();
    const c = cq.data as { cuenta: string; denominacion: string } | null;
    if (c) cuentaTxt = `${c.cuenta} — ${c.denominacion}`;
  }
  // Origen del dinero
  let origenTxt = "";
  if (g.entidad_bancaria_id) {
    const b = await supabase.from("entidades_bancarias").select("nombre").eq("empresa_id", auth.empresa_id).eq("id", String(g.entidad_bancaria_id)).maybeSingle();
    origenTxt = `Banco: ${(b.data as { nombre?: string } | null)?.nombre ?? ""}`;
  } else if (g.caja_chica_id) {
    const k = await supabase.from("cajas_chicas").select("nombre").eq("empresa_id", auth.empresa_id).eq("id", String(g.caja_chica_id)).maybeSingle();
    origenTxt = `Caja chica: ${(k.data as { nombre?: string } | null)?.nombre ?? ""}`;
  }

  const monto = `Gs. ${(Number(g.monto) || 0).toLocaleString("es-PY")}`;
  const cuerpo = `
  ${cabeceraDoc({ titulo: "RECIBO DE GASTO", numero: fechaDoc(g.fecha) })}
  <div class="box pad dos">
    <div>
      <div class="fila"><span class="l">FECHA:</span><span>${fechaDoc(g.fecha)}</span></div>
      <div class="fila"><span class="l">CATEGORÍA:</span><span>${esc(g.categoria ?? "—")}</span></div>
      ${g.recurrente ? `<div class="fila"><span class="l">RECURRENTE:</span><span>Sí${g.frecuencia ? ` (${esc(g.frecuencia)})` : ""}</span></div>` : ""}
    </div>
    <div>
      <div class="fila"><span class="l">CUENTA CONTABLE:</span><span>${esc(cuentaTxt || "—")}</span></div>
      ${origenTxt ? `<div class="fila"><span class="l">PAGADO CON:</span><span>${esc(origenTxt)}</span></div>` : ""}
    </div>
  </div>
  <table class="g" style="margin-bottom:3px">
    <thead><tr><th>Concepto / Descripción</th><th style="width:140px">Monto</th></tr></thead>
    <tbody>
      <tr><td>${esc(g.descripcion ?? g.categoria ?? "Gasto")}</td><td class="r">${monto}</td></tr>
      <tr class="fin"><td class="r" style="font-weight:bold">TOTAL</td><td class="r" style="font-weight:bold">${monto}</td></tr>
    </tbody>
  </table>
  <div class="box firmas">
    <div class="ln"><span>Recibí conforme:</span><i></i></div><div class="ln"><span>Entregó:</span><i></i></div>
    <div class="ln"><span>Aclaración:</span><i></i></div><div class="ln"><span>Aclaración:</span><i></i></div>
    <div class="ln"><span>C.I. Nº:</span><i></i></div><div class="ln"><span>C.I. Nº:</span><i></i></div>
  </div>`;
  return new NextResponse(paginaDoc("Recibo de Gasto", cuerpo, auto), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
