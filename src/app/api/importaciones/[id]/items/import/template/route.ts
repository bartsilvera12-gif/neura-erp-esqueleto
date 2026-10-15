import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/excel/export";
import { ITEMS_TEMPLATE_ROW } from "@/lib/importaciones/items-import";

export async function GET() {
  const cols = Object.keys(ITEMS_TEMPLATE_ROW).map((k) => ({
    header: k,
    value: (r: typeof ITEMS_TEMPLATE_ROW) => r[k as keyof typeof ITEMS_TEMPLATE_ROW],
    width: 20,
  }));
  // Dos filas de ejemplo para que se vea cómo llenar cada columna.
  const ejemplos = [
    ITEMS_TEMPLATE_ROW,
    { SKU: "EJ-002", NOMBRE: "OTRO PRODUCTO", CANTIDAD: 5, PRECIO_UNITARIO: 120, MONEDA: "USD" },
  ];
  const buf = buildXlsxBuffer(ejemplos, cols, { sheetName: "Mercadería" });
  return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders("plantilla-mercaderia-importacion") });
}
