import { traerTodo } from "@/lib/comex/server";
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { buildXlsxBuffer, nowStamp, xlsxResponseHeaders } from "@/lib/excel/export";

export const runtime = "nodejs";

type F = Record<string, string | number | boolean | null>;
const n = (v: unknown) => Number(v) || 0;
const fechaES = (iso: unknown) => {
  const s = String(iso ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "";
};

/** GET — Excel del listado de facturas (QA-22), con los mismos filtros de la pantalla. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sp = new URL(request.url).searchParams;
    let query = ctx.supabase
      .from("facturas_exportacion")
      .select(
        "tipo, numero_formateado, fecha, condicion_venta, cliente_nombre, cliente_documento, cliente_pais, moneda, tipo_cambio, total_exentas, total_gravado5, iva5, total_gravado10, iva10, total, total_pyg, estado, prueba, motivo_anulacion, created_by_nombre, emitida_at, timbrado"
      )
      .eq("empresa_id", ctx.auth.empresa_id)
      .neq("estado", "BORRADOR")
      .order("fecha")
      .order("numero")
      .order("id");
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const estado = sp.get("estado");
    const tipo = sp.get("tipo");
    const punto = sp.get("punto");
    const modo = sp.get("modo");
    const q = sp.get("q");
    if (desde) query = query.gte("fecha", desde);
    if (hasta) query = query.lte("fecha", hasta);
    if (estado === "EMITIDA" || estado === "ANULADA") query = query.eq("estado", estado);
    if (tipo === "EXPORTACION" || tipo === "LOCAL") query = query.eq("tipo", tipo);
    if (punto) query = query.eq("punto_expedicion", punto);
    if (modo === "prueba") query = query.eq("prueba", true);
    if (modo === "real") query = query.eq("prueba", false);
    if (q) {
      const t = q.replace(/[,()*%\\]/g, " ").trim();
      if (t) query = query.or(`cliente_nombre.ilike.*${t}*,numero_formateado.ilike.*${t}*`);
    }
    // De a 1000 filas (el servidor no devuelve más por pedido).
    const filas = await traerTodo<F>((a, z) => query.range(a, z));
    const vig = filas.filter((f) => f.estado === "EMITIDA" && !f.prueba);
    const totalGs = vig.reduce((s, f) => s + (f.moneda === "PYG" ? n(f.total) : n(f.total_pyg)), 0);
    const pie: F = { tipo: null, numero_formateado: "TOTAL en Gs. (emitidas reales)", total_pyg: totalGs };

    const buf = buildXlsxBuffer<F>([...filas, pie], [
      { header: "Tipo", value: (r) => (r.tipo === "LOCAL" ? "Local" : r.tipo === "EXPORTACION" ? "Exportación" : ""), width: 12 },
      { header: "Número", value: (r) => r.numero_formateado as string, width: 20 },
      { header: "Timbrado", value: (r) => r.timbrado as string, width: 10 },
      { header: "Fecha", value: (r) => fechaES(r.fecha), width: 11 },
      { header: "Condición", value: (r) => (r.condicion_venta === "CREDITO" ? "Crédito" : r.condicion_venta ? "Contado" : ""), width: 10 },
      { header: "Cliente", value: (r) => r.cliente_nombre as string, width: 32 },
      { header: "RUC / CI", value: (r) => r.cliente_documento as string, width: 14 },
      { header: "País", value: (r) => r.cliente_pais as string, width: 12 },
      { header: "Moneda", value: (r) => r.moneda as string, width: 7 },
      { header: "Tipo de cambio", value: (r) => (r.moneda && r.moneda !== "PYG" ? n(r.tipo_cambio) : ""), width: 12 },
      { header: "Exentas", value: (r) => (r.tipo ? n(r.total_exentas) : ""), width: 13 },
      { header: "Gravado 5%", value: (r) => (r.tipo ? n(r.total_gravado5) : ""), width: 13 },
      { header: "IVA 5%", value: (r) => (r.tipo ? n(r.iva5) : ""), width: 11 },
      { header: "Gravado 10%", value: (r) => (r.tipo ? n(r.total_gravado10) : ""), width: 13 },
      { header: "IVA 10%", value: (r) => (r.tipo ? n(r.iva10) : ""), width: 11 },
      { header: "Total", value: (r) => (r.tipo ? n(r.total) : ""), width: 14 },
      { header: "Total en Gs.", value: (r) => (r.moneda === "PYG" ? n(r.total) : n(r.total_pyg)), width: 15 },
      { header: "Estado", value: (r) => (r.estado === "ANULADA" ? "ANULADA" : r.estado ? "Emitida" : ""), width: 10 },
      { header: "Prueba", value: (r) => (r.tipo ? (r.prueba ? "Sí" : "No") : ""), width: 8 },
      { header: "Motivo de anulación", value: (r) => r.motivo_anulacion as string, width: 28 },
      { header: "Emitida por", value: (r) => r.created_by_nombre as string, width: 16 },
    ], { sheetName: "Facturas" });
    return new Response(new Uint8Array(buf), { headers: xlsxResponseHeaders(`facturas_${nowStamp()}`) });
  } catch (err) {
    console.error("[/api/facturas-exportacion/export GET]", err);
    return NextResponse.json(errorResponse("No se pudo exportar."), { status: 500 });
  }
}
