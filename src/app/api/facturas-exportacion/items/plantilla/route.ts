import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/excel/export";

/**
 * GET ?tipo=LOCAL|EXPORTACION — plantilla para cargar los productos de una
 * factura desde Excel. Una fila por producto.
 */
const EJEMPLO = {
  codigo: "SKU-0001",
  descripcion: "Sofá 3 cuerpos",
  unidad: "UN",
  cantidad: 2,
  precio_unitario: 1500000,
  descuento: 0,
  iva: "10",
};

export async function GET(request: Request) {
  const tipo = new URL(request.url).searchParams.get("tipo") === "LOCAL" ? "LOCAL" : "EXPORTACION";
  // En exportación todo va exento: la columna de IVA no corresponde.
  const claves = (Object.keys(EJEMPLO) as (keyof typeof EJEMPLO)[]).filter((k) => tipo === "LOCAL" || k !== "iva");
  const ancho: Record<string, number> = { codigo: 16, descripcion: 42, unidad: 10, cantidad: 10, precio_unitario: 18, descuento: 12, iva: 8 };
  const fila =
    tipo === "LOCAL"
      ? EJEMPLO
      : { ...EJEMPLO, precio_unitario: 450, descripcion: "KING WALL PANEL BED" };
  const cols = claves.map((k) => ({ header: k, value: (r: typeof EJEMPLO) => r[k], width: ancho[k] ?? 16 }));
  const buf = buildXlsxBuffer([fila], cols, { sheetName: "Productos" });
  return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders(`productos-factura-${tipo.toLowerCase()}`) });
}
