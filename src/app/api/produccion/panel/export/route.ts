import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { datosPanel, type ProyectoPanel, type InventarioPanel } from "@/lib/produccion/panel-helper";
import { buildXlsxBuffer, xlsxResponseHeaders, type ExportColumn } from "@/lib/excel/export";
import { ESTADO_PROYECTO_LABEL } from "@/lib/produccion/estados";

const gs = (n: unknown) => Math.round(Number(n) || 0);

/** GET ?reporte=rentabilidad|inventario|desviaciones — exporta el reporte a Excel. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const reporte = new URL(request.url).searchParams.get("reporte") ?? "rentabilidad";
    const datos = await datosPanel(ctx.supabase as unknown as AppSupabaseClient, ctx.auth.empresa_id);

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
