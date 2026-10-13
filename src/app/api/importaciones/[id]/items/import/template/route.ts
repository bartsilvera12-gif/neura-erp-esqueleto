import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/excel/export";
import { ITEMS_TEMPLATE_ROW } from "@/lib/importaciones/items-import";

export async function GET() {
  const cols = Object.keys(ITEMS_TEMPLATE_ROW).map((k) => ({
    header: k,
    value: (r: typeof ITEMS_TEMPLATE_ROW) => r[k as keyof typeof ITEMS_TEMPLATE_ROW],
    width: 20,
  }));
  const buf = buildXlsxBuffer([ITEMS_TEMPLATE_ROW], cols, { sheetName: "Mercadería" });
  return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders("plantilla-mercaderia-importacion") });
}
