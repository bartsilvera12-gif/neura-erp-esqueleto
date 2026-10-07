import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { cabeceraDoc, esc, fechaDoc, filasVacias, paginaDoc } from "@/lib/documentos/formato";
import { EMPRESA_DOC } from "@/lib/documentos/membrete";
import { EMPRESA_FACTURA } from "@/lib/facturas-exportacion/config";

/**
 * GET /api/notas-remision/[id]/imprimir?auto=1
 * La nota de remisión como documento aparte, con el formato del talonario.
 * Se sirve fuera del sistema para que al imprimir no salga el menú.
 */
const FILAS_MIN = 14;

export async function GET(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  const { id } = await p.params;
  const auto = new URL(request.url).searchParams.get("auto") === "1";
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new NextResponse("No autorizado", { status: 401 });
  const emp = ctx.auth.empresa_id;

  const { data, error } = await ctx.supabase.from("notas_remision").select("*").eq("empresa_id", emp).eq("id", id).maybeSingle();
  if (error || !data) return new NextResponse("Nota de remisión no encontrada", { status: 404 });
  const nr = data as Record<string, unknown>;

  // Vigencia del timbrado: por el timbrado elegido al emitir; si la nota es vieja
  // y no quedó vinculada, se busca por el número de timbrado impreso.
  type VigenciaTimbrado = { vigencia_desde: string | null; vigencia_hasta: string | null };
  let cfgTimbrado: VigenciaTimbrado | null = null;
  if (nr.timbrado_config_id || nr.timbrado) {
    const q = ctx.supabase.from("notas_remision_config").select("vigencia_desde, vigencia_hasta").eq("empresa_id", emp);
    const { data: cfg } = await (nr.timbrado_config_id
      ? q.eq("id", String(nr.timbrado_config_id)).maybeSingle()
      : q.eq("timbrado", String(nr.timbrado)).limit(1).maybeSingle());
    cfgTimbrado = (cfg ?? null) as VigenciaTimbrado | null;
  }

  // El documento de origen se rotula "Fact. de Exportación" solo si realmente lo es.
  const nroOrigen = String(nr.documento_origen ?? "").replace(/^factura\s*/i, "").trim();
  let origenEsExportacion = false;
  if (nroOrigen) {
    const { data: fx } = await ctx.supabase
      .from("facturas_exportacion")
      .select("tipo")
      .eq("empresa_id", emp)
      .eq("numero_formateado", nroOrigen)
      .maybeSingle();
    origenEsExportacion = (fx as { tipo?: string } | null)?.tipo === "EXPORTACION";
  }

  const ubicIds = [nr.ubicacion_origen_id, nr.ubicacion_destino_id].filter(Boolean) as string[];
  const [its, ubs, cli] = await Promise.all([
    ctx.supabase.from("notas_remision_items").select("producto_id, cantidad").eq("nota_remision_id", id),
    ubicIds.length
      ? ctx.supabase.from("inventario_ubicaciones").select("id, nombre").eq("empresa_id", emp).in("id", ubicIds)
      : Promise.resolve({ data: [] }),
    nr.cliente_id
      ? ctx.supabase.from("clientes").select("*").eq("empresa_id", emp).eq("id", String(nr.cliente_id)).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const items = (its.data ?? []) as { producto_id: string; cantidad: number }[];
  const nombreUb = new Map(((ubs.data ?? []) as { id: string; nombre: string }[]).map((u) => [u.id, u.nombre]));

  const prods = items.length
    ? (await ctx.supabase.from("productos").select("id, nombre, sku, unidad_medida").eq("empresa_id", emp).in("id", items.map((i) => i.producto_id))).data ?? []
    : [];
  const porId = new Map((prods as { id: string; nombre: string; sku: string | null; unidad_medida: string | null }[]).map((p) => [p.id, p]));

  const c = (cli.data ?? null) as Record<string, unknown> | null;
  const aCliente = (nr.destino_tipo ?? "deposito") === "cliente";
  const destinatario = aCliente ? String(nr.destino_nombre ?? "") : EMPRESA_DOC.nombre;
  const docDestinatario = aCliente ? String(c?.ruc ?? c?.documento ?? "") : EMPRESA_DOC.ruc;
  const origen = nr.ubicacion_origen_id ? nombreUb.get(String(nr.ubicacion_origen_id)) ?? "" : "";
  const llegada = aCliente
    ? [nr.destino_direccion, nr.destino_ciudad].filter(Boolean).join(" - ")
    : nr.ubicacion_destino_id
      ? nombreUb.get(String(nr.ubicacion_destino_id)) ?? ""
      : "";
  const cant = (n: unknown) => Number(n || 0).toLocaleString("es-PY");

  const vigencia =
    cfgTimbrado && (cfgTimbrado.vigencia_desde || cfgTimbrado.vigencia_hasta)
      ? `${fechaDoc(cfgTimbrado.vigencia_desde)} - ${fechaDoc(cfgTimbrado.vigencia_hasta)}`
      : "";

  const cuerpo = `
  ${cabeceraDoc({
    titulo: "NOTA DE REMISION",
    numero: String(nr.numero ?? ""),
    // Mismo bloque de datos que la factura de exportación.
    fiscales: [
      ["RUC", EMPRESA_DOC.ruc],
      ...(nr.timbrado ? ([["TIMBRADO", String(nr.timbrado)]] as [string, string][]) : []),
      ...(vigencia ? ([["VIGENCIA", vigencia]] as [string, string][]) : []),
      ["AUTOIMPRESOR", EMPRESA_FACTURA.autoimpresorNro],
    ],
  })}
  ${nr.prueba ? `<div style="border:2px solid #b45309;color:#b45309;font-weight:bold;text-align:center;padding:5px;margin-bottom:3px;letter-spacing:2px">PRUEBA · SIN VALOR</div>` : ""}
  <div class="box pad">
    <div class="fila"><span class="l" style="flex-basis:170px">Nombre / Razon Social:</span><span>${esc(destinatario.toUpperCase())}</span></div>
    <div class="fila"><span class="l" style="flex-basis:170px">Dir. Punto de Partida:</span><span>${esc(origen)}</span></div>
    <div class="fila"><span class="l" style="flex-basis:170px">Dir. Punto de Llegada:</span><span>${esc(llegada)}</span></div>
    <div class="fila"><span class="l" style="flex-basis:170px">R.U.C. / C.I. Destinatario:</span><span>${esc(docDestinatario)}</span></div>
  </div>
  <div class="box pad dos">
    <div class="fila"><span class="l">Fecha Inicio Traslado:</span><span>${fechaDoc(nr.fecha_inicio_traslado)}</span></div>
    <div class="fila"><span class="l">Fecha Termino Traslado:</span><span>${fechaDoc(nr.fecha_fin_traslado)}</span></div>
    <div class="fila"><span class="l">Marca de Vehiculo:</span><span>${esc(nr.marca_vehiculo)}</span></div>
    <div class="fila"><span class="l">Nro. de Chapa:</span><span>${esc(nr.chapa)}</span></div>
    <div class="fila"><span class="l">Nombre Conductor:</span><span>${esc(nr.conductor)}</span></div>
    <div class="fila"><span class="l">C.I. Conductor:</span><span>${esc(nr.ci_conductor)}</span></div>
    <div class="fila"><span class="l">Almacén de Salida:</span><span>${esc(origen.toUpperCase())}</span></div>
    <div class="fila"><span class="l">Destino:</span><span>${esc(aCliente ? nr.destino_ciudad : llegada)}</span></div>
    ${
      nr.documento_origen
        ? `<div class="fila" style="grid-column:1/-1"><span class="l">${
            origenEsExportacion ? "Fact. de Exportación:" : "Comprobante de venta:"
          }</span><span>${esc(origenEsExportacion ? nroOrigen : nr.documento_origen)}</span></div>`
        : ""
    }
  </div>
  <table class="g">
    <thead><tr><th style="width:18%">Cantidad</th><th style="width:16%">Unidad de medida</th><th>Descripcion de articulo</th></tr></thead>
    <tbody>
      ${items
        .map((i) => {
          const p = porId.get(i.producto_id);
          return `<tr><td class="c">${cant(i.cantidad)}</td><td class="c">${esc((p?.unidad_medida ?? "").toUpperCase())}</td><td>${esc([p?.sku, p?.nombre].filter(Boolean).join(" "))}</td></tr>`;
        })
        .join("")}
      ${filasVacias(Math.max(1, FILAS_MIN - items.length), 3)}
    </tbody>
  </table>
  ${nr.observaciones ? `<div class="box pad" style="margin-top:3px">Observaciones: ${esc(nr.observaciones)}</div>` : ""}
  ${nr.estado === "rechazada" ? `<div class="box pad" style="margin-top:3px"><strong>RECHAZADA.</strong> Motivo: ${esc(nr.motivo_rechazo)}</div>` : ""}
  <div class="box firmas" style="margin-top:6px">
    <div class="ln"><span>Entregado por:</span><i></i></div><div class="ln"><span>Recibido por:</span><i></i></div>
    <div class="ln"><span>Aclaración de firma:</span><i></i></div><div class="ln"><span>Aclaración de firma:</span><i></i></div>
  </div>`;
  return new NextResponse(paginaDoc(`Nota de remisión ${nr.numero ?? ""}`, cuerpo, auto), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
