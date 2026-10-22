import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { cabeceraDoc, esc, fechaDoc, paginaDoc } from "@/lib/documentos/formato";
import { numeroALetras } from "@/lib/facturas-exportacion/numero-a-letras";
import { NOMBRE_MONEDA } from "@/lib/facturas-exportacion/config";
import { esInstanciaLR } from "@/lib/inventario/campos-lr";
import { signProductoImagen } from "@/lib/inventario/imagen-storage";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

/** Bloque de condiciones comerciales de Living Room (reemplaza las firmas). */
const CONDICIONES_LR = [
  ["FORMA DE PAGO", "AL CONTADO (POR PAGO DIRECTO O POR TRANSFERENCIA BANCARIA)."],
  ["ENTREGA", "Productos en Stock de 1 a 2 días hábiles a partir de la confirmación del cliente y previa cancelación total, para programar la entrega, salvo huelgas, paros y/o convulsiones sociales que perjudiquen el transporte de los productos. Productos en Importación entregas dentro del parámetro de 45 a 60 días, bajo coordinación con Jefatura comercial y/o Gerencia (parámetros coordinados)."],
  ["GARANTÍA", "La garantía es otorgada por la empresa LIVINGROOM MUEBLES IMPORTADOS por fallas o desperfectos de fábrica, es de 1 año solo para sofás sueltos o juegos completos."],
  ["SERVICIO DE ENTREGA", "Ofrecemos entrega gratuita hasta su domicilio dentro del área urbana. El servicio deja todo puesto y acomodado en el lugar (se deben dejar los espacios habilitados para los mismos)."],
  ["ÁREA INTERIORISMO", "Livingroom ofrece el servicio de asesoramiento en interiores de su vivienda, departamento u otros espacios según requerimiento o necesidad, dando como resultado una propuesta 3D (renders) para cumplir sus expectativas, sin ningún costo."],
  ["POLÍTICA DE ENVÍOS EXTERNOS", "IMPORTANTE: En el caso de envíos realizados a través de transportadoras externas, nuestra empresa no se hace responsable de posibles daños, pérdidas o cualquier inconveniente que pueda surgir. Nos encargamos de embalar adecuadamente los productos y entregarlos a la transportadora en el punto de envío, tomando todas las medidas necesarias para garantizar que la carga esté en perfectas condiciones al momento de su despacho. Sin embargo, una vez entregado el paquete a la transportadora, el control y la responsabilidad sobre el envío recaen en la empresa transportista selecta."],
] as const;

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
  const lr = esInstanciaLR();
  const itemCols = "producto_id, producto_nombre, sku, cantidad, unidad_medida, precio_unitario, descuento, total"
    + (lr ? ", descuento_pct" : "");
  const itq = await ctx.supabase
    .from("presupuesto_items")
    .select(itemCols)
    .eq("empresa_id", emp)
    .eq("presupuesto_id", id)
    .order("created_at", { ascending: true });
  const items = (itq.data ?? []) as unknown as Record<string, unknown>[];

  // Datos extra del producto: descripción e imagen (para la tabla con foto).
  const prodIds = [...new Set(items.map((i) => i.producto_id).filter(Boolean).map(String))];
  const prodInfo = new Map<string, { descripcion: string | null; imagen_url: string | null }>();
  if (prodIds.length) {
    const prq = await ctx.supabase.from("productos").select("id, descripcion, imagen_path").eq("empresa_id", emp).in("id", prodIds);
    for (const r of (prq.data ?? []) as { id: string; descripcion: string | null; imagen_path: string | null }[]) {
      const url = r.imagen_path ? await signProductoImagen(ctx.supabase as unknown as AppSupabaseClient, r.imagen_path, 3600) : null;
      prodInfo.set(r.id, { descripcion: r.descripcion, imagen_url: url });
    }
  }

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
  const simb = moneda === "USD" ? "USD" : "Gs.";

  // Filas de la tabla (con imagen, descripción y columnas de descuento).
  let totalNormal = 0;
  const filas = items.map((it) => {
    const cant = Number(it.cantidad) || 0;
    const precio = Number(it.precio_unitario) || 0;
    const totalSinDesc = precio * cant;
    const descAbs = Number(it.descuento) || 0;
    const totalConDesc = Number(it.total) || Math.max(0, totalSinDesc - descAbs);
    const precioConDesc = cant > 0 ? totalConDesc / cant : precio;
    totalNormal += totalSinDesc;
    const pid = it.producto_id ? String(it.producto_id) : "";
    const info = pid ? prodInfo.get(pid) : undefined;
    const desc = info?.descripcion ? `<div style="font-size:9px;color:#333">${esc(info.descripcion)}</div>` : "";
    const sku = it.sku ? `<div style="font-size:9px;color:#666">SKU: ${esc(it.sku)}</div>` : "";
    const img = info?.imagen_url
      ? `<img src="${esc(info.imagen_url)}" style="max-width:78px;max-height:60px;object-fit:contain" />`
      : "";
    return `<tr>
      <td class="c">${num(cant)}</td>
      <td><b>${esc(it.producto_nombre)}</b>${desc}${sku}</td>
      <td class="c">${img}</td>
      <td class="r">${num(precio)}</td>
      <td class="r">${num(totalSinDesc)}</td>
      <td class="r">${num(precioConDesc)}</td>
      <td class="r">${num(totalConDesc)}</td>
    </tr>`;
  }).join("");
  const descuentoTotal = Math.max(0, totalNormal - (Number(p.total) || 0));
  const validez = p.validez_dias ? `${Number(p.validez_dias)} día(s)` : "";

  const cuerpo = `
  ${cabeceraDoc({ titulo: "PRESUPUESTO DE VENTA", numero })}
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
      ${validez ? `<div class="fila"><span class="l">Propuesta válida:</span><span>${esc(validez)}</span></div>` : ""}
    </div>
  </div>
  <table class="g">
    <thead><tr>
      <th style="width:48px">Cant</th>
      <th>Modelo / Descripción</th>
      <th style="width:90px">Imagen</th>
      <th style="width:90px">Precio unitario ${simb}</th>
      <th style="width:95px">Total sin descuento ${simb}</th>
      <th style="width:95px">Precio unitario con descuento ${simb}</th>
      <th style="width:95px">Total con descuento ${simb}</th>
    </tr></thead>
    <tbody>
      ${filas || `<tr><td colspan="7" class="c" style="padding:10px;color:#888">Sin ítems.</td></tr>`}
    </tbody>
  </table>
  <div class="box pad dos" style="margin-top:4px">
    <div style="align-self:center;text-transform:uppercase;font-size:11px">
      <b>Son:</b> ${esc(numeroALetras(Number(p.total) || 0))}
    </div>
    <div>
      <div class="fila"><span class="l">TOTAL A PAGAR (precio normal):</span><span class="r" style="flex:1;font-weight:bold">${simb} ${num(totalNormal)}</span></div>
      <div class="fila"><span class="l">DESCUENTO:</span><span class="r" style="flex:1;font-weight:bold">${descuentoTotal > 0 ? "- " + simb + " " + num(descuentoTotal) : "-"}</span></div>
      <div class="fila" style="border-top:1px solid #000;padding-top:4px"><span class="l">TOTAL A PAGAR:</span><span class="r" style="flex:1;font-weight:bold;font-size:14px">${simb} ${num(p.total)}</span></div>
    </div>
  </div>
  ${p.observaciones ? `<div class="box pad" style="margin-top:3px">Observaciones: ${esc(p.observaciones)}</div>` : ""}
  <div class="box pad" style="margin-top:6px;font-size:10px;line-height:1.4">
    <div style="font-weight:bold;color:#3F8E91;margin-bottom:3px">Servicio de transporte (sólo dentro del radio urbano), instalación y ejecución gratuita.</div>
    ${CONDICIONES_LR.map(([k, v]) => `<div style="margin-bottom:3px"><b>${esc(k)}:</b> ${esc(v)}</div>`).join("")}
    <div style="margin-top:6px;border-top:1px solid #ccc;padding-top:4px;text-align:center;color:#444">
      📷 Instagram: livingroommuebles &nbsp;·&nbsp; 📘 Facebook: Living Room Muebles &nbsp;·&nbsp; 🌐 www.livingroom.com.py
    </div>
  </div>`;
  return new NextResponse(paginaDoc(`Presupuesto de venta ${p.numero_control ?? ""}`, cuerpo, auto), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
