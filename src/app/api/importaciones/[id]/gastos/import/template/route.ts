import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/excel/export";
import { GASTOS_TEMPLATE_ROW } from "@/lib/importaciones/gastos-import";

export async function GET() {
  const cols = Object.keys(GASTOS_TEMPLATE_ROW).map((k) => ({
    header: k,
    value: (r: typeof GASTOS_TEMPLATE_ROW) => r[k as keyof typeof GASTOS_TEMPLATE_ROW],
    width: 20,
  }));
  const ejemplos: (typeof GASTOS_TEMPLATE_ROW)[] = [
    GASTOS_TEMPLATE_ROW,
    { CONCEPTO: "FLETE INTERNACIONAL", FECHA: "2026-10-18", PROVEEDOR: "NAVIERA XYZ", RUC: "", COMPROBANTE: "", TIMBRADO: "", CUENTA: "", MONTO: 2670, MONEDA: "USD", TIPO_CAMBIO: 7300, LLEVA_IVA: "NO", IVA_PORCENTAJE: 10, PAGADO: "NO", DESCRIPCION: "" },
  ];
  const buf = buildXlsxBuffer(ejemplos, cols, { sheetName: "Gastos" });
  return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders("plantilla-gastos-importacion") });
}
