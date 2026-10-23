import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { datosPanel, type ProyectoPanel, type InventarioPanel } from "@/lib/produccion/panel-helper";
import { buildXlsxBuffer, xlsxResponseHeaders, type ExportColumn } from "@/lib/excel/export";
import { pdfTabla, type ColPdf } from "@/lib/produccion/pdf-tabla";
import { ESTADO_PROYECTO_LABEL } from "@/lib/produccion/estados";

const gs = (n: unknown) => Math.round(Number(n) || 0);
const miles = (n: unknown) => Math.round(Number(n) || 0).toLocaleString("es-PY");

/** GET ?reporte=rentabilidad|inventario|desviaciones &formato=excel|pdf — exporta el reporte. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sp = new URL(request.url).searchParams;
    const reporte = sp.get("reporte") ?? "rentabilidad";
    const formato = sp.get("formato") === "pdf" ? "pdf" : "excel";
    const datos = await datosPanel(ctx.supabase as unknown as AppSupabaseClient, ctx.auth.empresa_id);

    // --- PDF ---
    if (formato === "pdf") {
      let titulo: string, cols: ColPdf[], filas: string[][];
      if (reporte === "inventario") {
        titulo = "Inventario de producción";
        cols = [{ header: "Tipo", width: 60 }, { header: "Código", width: 95 }, { header: "Descripción", width: 230 }, { header: "Físico", width: 55, align: "right" }, { header: "Dispon.", width: 60, align: "right" }, { header: "Costo prom.", width: 95, align: "right" }, { header: "Valorización", width: 110, align: "right" }];
        filas = datos.inventario.map((r) => [r.articulo_tipo, r.codigo, r.descripcion, String(r.fisico), String(r.disponible), miles(r.costo_promedio), miles(r.valorizacion)]);
      } else if (reporte === "desviaciones") {
        titulo = "Causas de desviación (adicionales)";
        cols = [{ header: "Causa", width: 400 }, { header: "Monto (Gs.)", width: 160, align: "right" }];
        filas = datos.desviaciones_causa.map((r) => [r.label, miles(r.monto)]);
      } else {
        titulo = "Rentabilidad por proyecto";
        cols = [{ header: "Código", width: 90 }, { header: "Proyecto", width: 150 }, { header: "Estado", width: 80 }, { header: "Costo pres.", width: 90, align: "right" }, { header: "Costo real", width: 90, align: "right" }, { header: "Ingreso", width: 90, align: "right" }, { header: "Utilidad", width: 90, align: "right" }, { header: "Margen", width: 60, align: "right" }];
        filas = datos.proyectos.map((r) => [r.codigo, r.nombre, ESTADO_PROYECTO_LABEL[r.estado] ?? r.estado, miles(r.costo_presupuestado), miles(r.costo_real), miles(r.ingreso_final), miles(r.utilidad_real), r.margen_real == null ? "N/C" : `${r.margen_real}%`]);
      }
      const pdf = await pdfTabla(titulo, cols, filas);
      return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="produccion-${reporte}.pdf"`, "Cache-Control": "no-store" } });
    }

    // --- Excel ---
    let buf: Buffer, nombre: string;
    if (reporte === "inventario") {
      const cols: ExportColumn<InventarioPanel>[] = [
        { header: "Tipo", value: (r) => r.articulo_tipo, width: 10 },
        { header: "Código", value: (r) => r.codigo, width: 16 },
        { header: "Descripción", value: (r) => r.descripcion, width: 36 },
        { header: "Unidad", value: (r) => r.unidad, width: 12 },
        { header: "Físico", value: (r) => r.fisico, width: 10 },
        { header: "Reservado", value: (r) => r.reservado, width: 10 },
        { header: "Disponible", value: (r) => r.disponible, width: 10 },
        { header: "Stock mínimo", value: (r) => r.stock_minimo ?? "", width: 12 },
        { header: "Bajo mínimo", value: (r) => (r.bajo ? "Sí" : ""), width: 12 },
        { header: "Costo promedio", value: (r) => r.costo_promedio, width: 14 },
        { header: "Valorización", value: (r) => r.valorizacion, width: 14 },
      ];
      buf = buildXlsxBuffer(datos.inventario, cols, { sheetName: "Inventario" });
      nombre = "produccion-inventario";
    } else if (reporte === "desviaciones") {
      const cols: ExportColumn<{ label: string; monto: number }>[] = [
        { header: "Causa", value: (r) => r.label, width: 28 },
        { header: "Monto (Gs.)", value: (r) => gs(r.monto), width: 16 },
      ];
      buf = buildXlsxBuffer(datos.desviaciones_causa, cols, { sheetName: "Desviaciones" });
      nombre = "produccion-desviaciones";
    } else {
      const cols: ExportColumn<ProyectoPanel>[] = [
        { header: "Código", value: (r) => r.codigo, width: 16 },
        { header: "Proyecto", value: (r) => r.nombre, width: 30 },
        { header: "Cliente", value: (r) => r.cliente_nombre ?? "", width: 24 },
        { header: "Estado", value: (r) => ESTADO_PROYECTO_LABEL[r.estado] ?? r.estado, width: 14 },
        { header: "Entrega prevista", value: (r) => r.fecha_entrega_prevista ?? "", width: 16 },
        { header: "Costo presupuestado", value: (r) => gs(r.costo_presupuestado), width: 18 },
        { header: "Costo real", value: (r) => gs(r.costo_real), width: 16 },
        { header: "Ingreso final", value: (r) => gs(r.ingreso_final), width: 16 },
        { header: "Utilidad real", value: (r) => gs(r.utilidad_real), width: 16 },
        { header: "Margen %", value: (r) => (r.margen_real == null ? "No calculable" : r.margen_real), width: 14 },
        { header: "Desviación", value: (r) => gs(r.desviacion), width: 14 },
      ];
      buf = buildXlsxBuffer(datos.proyectos, cols, { sheetName: "Rentabilidad" });
      nombre = "produccion-rentabilidad";
    }
    return new NextResponse(new Uint8Array(buf), { headers: xlsxResponseHeaders(nombre) });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
