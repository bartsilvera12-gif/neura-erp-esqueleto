import { NextRequest, NextResponse } from "next/server";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { requireReportesApiAccess } from "@/lib/reportes/reportes-auth";
import { buildXlsxBuffer, xlsxResponseHeaders, nowStamp } from "@/lib/excel/export";
import { successResponse, errorResponse } from "@/lib/api/response";
import { generarRG90, TIPO_REGISTRO, type Rg90Row, type TipoRegistroRg90 } from "@/lib/reportes/rg90";

export const runtime = "nodejs";

function parseFiltros(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const desde = sp.get("desde") ?? "";
  const hasta = sp.get("hasta") ?? "";
  const tiposRaw = (sp.get("tipos") ?? "COMPRAS,VENTAS").split(",").map((s) => s.trim().toUpperCase());
  const tipos = tiposRaw.filter((t): t is TipoRegistroRg90 => (TIPO_REGISTRO as readonly string[]).includes(t));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return { error: "Fechas inválidas." as const };
  if (!tipos.length) return { error: "Elegí al menos un tipo (COMPRAS y/o VENTAS)." as const };
  return { desde, hasta, tipos };
}

/**
 * GET /api/reportes/rg90
 *   ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&tipos=COMPRAS,VENTAS[&formato=xlsx]
 *
 * Sin `formato`: devuelve JSON con la vista previa (filas + totales + errores).
 * Con `formato=xlsx`: descarga el XLSX en el layout de Marangatu (28 columnas).
 */
export async function GET(request: NextRequest) {
  const auth = await requireReportesApiAccess(request);
  if (!auth.ok) return new Response(auth.message, { status: auth.status });
  const f = parseFiltros(request);
  if ("error" in f && f.error) return NextResponse.json(errorResponse(f.error), { status: 400 });
  if (!("desde" in f)) return NextResponse.json(errorResponse("Filtros inválidos."), { status: 400 });

  try {
    const schema = await fetchDataSchemaForEmpresaId(auth.empresaId);
    const result = await generarRG90(schema, auth.empresaId, f);

    const formato = (new URL(request.url).searchParams.get("formato") ?? "json").toLowerCase();
    if (formato === "xlsx") {
      const buf = buildXlsxBuffer<Rg90Row>(result.rows, [
        { header: "RUC del Informante", value: (r) => r.ruc_informante, width: 14 },
        { header: "Nombre o Razon Social del Informante", value: (r) => r.nombre_informante, width: 40 },
        { header: "RUC / Nº de Identificacion del Informado", value: (r) => r.ruc_informado, width: 14 },
        { header: "Tipo de Identificación del Informado", value: (r) => r.tipo_identificacion, width: 10 },
        { header: "Nombre o Razón Social del Informado", value: (r) => r.nombre_informado, width: 40 },
        { header: "Tipo de Registro", value: (r) => r.tipo_registro, width: 10 },
        { header: "Tipo de Comprobante", value: (r) => r.tipo_comprobante, width: 18 },
        { header: "Fecha de Emisión", value: (r) => r.fecha_emision, width: 12 },
        { header: "Periodo de Emisión", value: (r) => r.periodo_emision, width: 10 },
        { header: "Condicion de la Operacion", value: (r) => r.condicion, width: 10 },
        { header: "Operación en Moneda Extranjera", value: (r) => r.moneda_extranjera, width: 10 },
        { header: "Timbrado del Comprobante", value: (r) => r.timbrado, width: 12 },
        { header: "Numero de Comprobante", value: (r) => r.numero_comprobante, width: 16 },
        { header: "CDC", value: (r) => r.cdc, width: 46 },
        { header: "Monto Gravado 10%", value: (r) => r.monto_gravado_10, width: 14 },
        { header: "IVA 10%", value: (r) => r.iva_10, width: 12 },
        { header: "Monto Gravado 5%", value: (r) => r.monto_gravado_5, width: 14 },
        { header: "IVA 5%", value: (r) => r.iva_5, width: 12 },
        { header: "Monto No Gravado / Exento ", value: (r) => r.monto_exento, width: 14 },
        { header: "Total Comprobante", value: (r) => r.total, width: 14 },
        { header: "Imputa IVA", value: (r) => r.imputa_iva, width: 10 },
        { header: "Imputa IRE", value: (r) => r.imputa_ire, width: 10 },
        { header: "Imputa IRP", value: (r) => r.imputa_irp, width: 10 },
        { header: "No Imputar", value: (r) => r.no_imputar, width: 10 },
        { header: "Numero de Comprobante Asociado", value: (r) => r.numero_comprobante_asociado, width: 16 },
        { header: "Timbrado del Comprobante Asociado", value: (r) => r.timbrado_asociado, width: 12 },
        { header: "Fecha de Registro", value: (r) => r.fecha_registro, width: 12 },
        { header: "Origen de la Información", value: (r) => r.origen_informacion, width: 14 },
      ], { sheetName: "Datos" });
      return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders(`RG90-${f.desde}-a-${f.hasta}-${nowStamp()}`) });
    }

    // JSON para la vista previa
    return NextResponse.json(successResponse({
      informante: result.informante,
      totales: result.totales,
      comprobantes_con_errores: result.comprobantes_con_errores,
      total_filas: result.rows.length,
      // Preview liviano para la pantalla.
      filas: result.rows.map((r) => ({
        tipo_registro: r.tipo_registro,
        fecha: r.fecha_emision,
        tipo_comprobante: r.tipo_comprobante,
        timbrado: r.timbrado,
        numero: r.numero_comprobante,
        ruc: r.ruc_informado,
        nombre: r.nombre_informado,
        moneda: r.moneda_extranjera || "PYG",
        total: r.total,
        gravado_10: r.monto_gravado_10,
        gravado_5: r.monto_gravado_5,
        exento: r.monto_exento,
        errores: r._errores,
        id_interno: r._id_interno,
        seccion: r._seccion ?? null,
      })),
    }));
  } catch (err) {
    console.error("[/api/reportes/rg90]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo generar el RG90."), { status: 500 });
  }
}
