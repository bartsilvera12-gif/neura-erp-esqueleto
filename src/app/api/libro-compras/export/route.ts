import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esUuid, getComexCtx, textoBusqueda, traerTodo } from "@/lib/comex/server";
import { buildXlsxBuffer, nowStamp, xlsxResponseHeaders } from "@/lib/excel/export";
import { COMPRA_COLS } from "@/lib/compras-libro/server";

export const runtime = "nodejs";

type Fila = Record<string, string | number | boolean | null>;
const n = (v: unknown) => Number(v) || 0;
const fechaES = (iso: unknown) => {
  const s = String(iso ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s;
};

/** GET — Excel del libro de compras con los mismos filtros del listado. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sp = new URL(request.url).searchParams;
    let q = ctx.supabase.from("libro_compras").select(COMPRA_COLS).eq("empresa_id", ctx.auth.empresa_id).order("fecha").order("created_at").order("id");
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) q = q.gte("fecha", desde);
    if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) q = q.lte("fecha", hasta);
    const tipo = sp.get("tipo");
    if (esUuid(tipo)) q = q.eq("tipo_id", tipo);
    const estado = sp.get("estado");
    if (estado === "registrada" || estado === "anulada") q = q.eq("estado", estado);
    const busca = textoBusqueda(sp.get("q"));
    if (busca) q = q.or(`proveedor_nombre.ilike.%${busca}%,nro_comprobante.ilike.%${busca}%,numero_control.ilike.%${busca}%,proveedor_ruc.ilike.%${busca}%`);
    const filas = await traerTodo<Fila>((a, z) => q.range(a, z));
    const vigentes = filas.filter((f) => f.estado !== "anulada");
    const tot = (k: string) => vigentes.reduce((s, f) => s + n(f[k]), 0);
    const totalFila: Fila = {
      fecha: null, tipo_nombre: "TOTAL (sin anulados)", total_exentas: tot("total_exentas"), total_gravado10: tot("total_gravado10"), iva10: tot("iva10"),
      total_gravado5: tot("total_gravado5"), iva5: tot("iva5"), total: tot("total"), retencion_iva: tot("retencion_iva"), retencion_renta: tot("retencion_renta"),
    };
    const buf = buildXlsxBuffer<Fila>([...filas, totalFila], [
      { header: "N° control", value: (r) => r.numero_control as string, width: 12 },
      { header: "Fecha", value: (r) => (r.fecha ? fechaES(r.fecha) : ""), width: 11 },
      { header: "Tipo", value: (r) => r.tipo_nombre as string, width: 22 },
      { header: "Condición", value: (r) => r.condicion as string, width: 10 },
      { header: "N° comprobante", value: (r) => r.nro_comprobante as string, width: 17 },
      { header: "Timbrado", value: (r) => r.timbrado as string, width: 11 },
      { header: "Proveedor", value: (r) => r.proveedor_nombre as string, width: 32 },
      { header: "RUC", value: (r) => r.proveedor_ruc as string, width: 13 },
      { header: "Moneda", value: (r) => r.moneda as string, width: 7 },
      { header: "Cotización", value: (r) => (r.moneda && r.moneda !== "PYG" ? n(r.cotizacion) : ""), width: 10 },
      { header: "Exentas", value: (r) => n(r.total_exentas), width: 13 },
      { header: "Gravado 10%", value: (r) => n(r.total_gravado10), width: 13 },
      { header: "IVA 10%", value: (r) => n(r.iva10), width: 11 },
      { header: "Gravado 5%", value: (r) => n(r.total_gravado5), width: 13 },
      { header: "IVA 5%", value: (r) => n(r.iva5), width: 11 },
      { header: "Total", value: (r) => n(r.total), width: 14 },
      { header: "Retención IVA", value: (r) => n(r.retencion_iva), width: 12 },
      { header: "Retención renta", value: (r) => n(r.retencion_renta), width: 12 },
      { header: "Electrónica", value: (r) => (r.numero_control ? (r.es_electronica ? "Sí" : "No") : ""), width: 10 },
      { header: "CDC", value: (r) => r.cdc as string, width: 46 },
      { header: "Explicación", value: (r) => r.explicacion as string, width: 30 },
      { header: "Estado", value: (r) => (r.estado === "anulada" ? "ANULADA" : r.estado ? "Registrada" : ""), width: 10 },
    ], { sheetName: "Libro de compras" });
    return new Response(new Uint8Array(buf), { headers: xlsxResponseHeaders(`libro_compras_${nowStamp()}`) });
  } catch (err) {
    console.error("[/api/libro-compras/export GET]", err);
    return NextResponse.json(errorResponse("No se pudo exportar."), { status: 500 });
  }
}
