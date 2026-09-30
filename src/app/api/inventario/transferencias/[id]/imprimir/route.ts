import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { cabeceraDoc, esc, fechaDoc, filasVacias, paginaDoc } from "@/lib/documentos/formato";

/**
 * GET /api/inventario/transferencias/[id]/imprimir?auto=1
 * Comprobante imprimible de una transferencia entre depósitos (HTML).
 * [id] es el transferencia_id que une la SALIDA y la ENTRADA.
 */
export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParams.params;
  const auto = new URL(request.url).searchParams.get("auto") === "1";
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new NextResponse("No autorizado", { status: 401 });
  const emp = ctx.auth.empresa_id;

  const mq = await ctx.supabase.from("movimientos_inventario").select("*").eq("empresa_id", emp).eq("transferencia_id", id);
  const movs = (mq.data ?? []) as Record<string, unknown>[];
  if (mq.error || !movs.length) return new NextResponse("Transferencia no encontrada", { status: 404 });
  const salidas = movs.filter((m) => m.tipo === "SALIDA");
  const lineas = salidas.length ? salidas : movs;
  const origenId = movs.map((m) => m.ubicacion_origen_id).find(Boolean) as string | undefined;
  const destinoId = movs.map((m) => m.ubicacion_destino_id).find(Boolean) as string | undefined;
  const cab = movs[0];

  const [ub, pr] = await Promise.all([
    ctx.supabase.from("inventario_ubicaciones").select("id, nombre").eq("empresa_id", emp).in("id", [origenId, destinoId].filter(Boolean) as string[]),
    ctx.supabase.from("productos").select("id, unidad_medida").eq("empresa_id", emp).in("id", lineas.map((l) => String(l.producto_id))),
  ]);
  const nombre = new Map(((ub.data ?? []) as { id: string; nombre: string }[]).map((u) => [u.id, u.nombre]));
  const unidad = new Map(((pr.data ?? []) as { id: string; unidad_medida: string | null }[]).map((p) => [p.id, p.unidad_medida ?? ""]));
  const cant = (n: unknown) => (Number(n) || 0).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const cuerpo = `
  ${cabeceraDoc({ titulo: "TRANSFERENCIA ENTRE DEPÓSITOS", numero: `Nro. de comprobante  ${String(cab.referencia ?? "").replace(/^TRANSF-/, "")}`, conLogo: false })}
  <div class="box pad dos">
    <div>
      <div class="fila"><span class="l" style="flex-basis:80px">FECHA:</span><span>${fechaDoc(cab.fecha ?? cab.created_at)}</span></div>
      ${cab.observacion ? `<div class="fila"><span class="l" style="flex-basis:80px">NOTA:</span><span>${esc(cab.observacion)}</span></div>` : ""}
    </div>
    <div>
      <div class="fila"><span class="l">TIPO:</span><span>TRASLADO</span></div>
      <div class="fila"><span class="l">USUARIO:</span><span>${esc(cab.usuario_nombre)}</span></div>
      <div class="fila"><span class="l">DEPOSITO ORIGEN:</span><span>${esc(origenId ? (nombre.get(origenId) ?? "") : "").toUpperCase()}</span></div>
      <div class="fila"><span class="l">DEPOSITO DESTINO:</span><span>${esc(destinoId ? (nombre.get(destinoId) ?? "") : "").toUpperCase()}</span></div>
    </div>
  </div>
  <table class="g" style="margin-bottom:3px">
    <thead><tr><th style="width:90px">Código</th><th style="width:70px">Cantidad</th><th style="width:70px">Unidad</th><th>Descripción</th></tr></thead>
    <tbody>
      ${lineas.map((l) => `<tr><td>${esc(l.producto_sku)}</td><td class="r">${cant(l.cantidad)}</td><td class="c">${esc(unidad.get(String(l.producto_id)) ?? "")}</td><td>${esc(l.producto_nombre)}</td></tr>`).join("")}
      ${filasVacias(Math.max(1, 12 - lineas.length), 4)}
    </tbody>
  </table>
  <div class="box firmas">
    <div class="ln"><span>Entregado por</span><i></i></div><div class="ln"><span>Recibí conforme:</span><i></i></div>
    <div class="ln"><span>Aclaración firma:</span><i></i></div><div class="ln"><span>Aclaración firma:</span><i></i></div>
    <div class="ln"><span>C.I. Nº:</span><i></i></div><div class="ln"><span>C.I. Nº:</span><i></i></div>
  </div>`;
  return new NextResponse(paginaDoc(`Transferencia ${cab.referencia ?? ""}`, cuerpo, auto), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
