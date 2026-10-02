import * as XLSX from "xlsx";
import { xlsxResponseHeaders } from "@/lib/excel/export";

/**
 * GET ?tipo=LOCAL|EXPORTACION — plantilla para cargar los productos de una
 * factura desde Excel. Trae dos hojas: "Productos" (lo que se llena) e
 * "Instrucciones" (qué va en cada columna).
 *
 * La fila de ejemplo va marcada con EJEMPLO en el código: al importar se
 * saltea, así nadie carga un sofá de mentira por olvidarse de borrarla.
 */
export async function GET(request: Request) {
  const tipo = new URL(request.url).searchParams.get("tipo") === "LOCAL" ? "LOCAL" : "EXPORTACION";
  const local = tipo === "LOCAL";
  const moneda = local ? "guaraníes" : "dólares";

  const cols: { h: string; ancho: number; ej: string | number; ayuda: string }[] = [
    { h: "Código", ancho: 18, ej: "EJEMPLO", ayuda: "El código (SKU) del producto en el inventario. Si coincide, el producto queda vinculado y se completan solos el nombre y la unidad. Se puede dejar vacío." },
    { h: "Descripción", ancho: 44, ej: local ? "Sofá 3 cuerpos tela gris" : "KING WALL PANEL BED", ayuda: "Lo que se imprime en la factura. Obligatorio si el código no está en el inventario." },
    { h: "Unidad", ancho: 10, ej: "UN", ayuda: "UN, PZA, CAJA… Si se deja vacío se usa la del producto." },
    { h: "Cantidad", ancho: 11, ej: 2, ayuda: "Mayor a 0. Admite decimales." },
    { h: "Precio unitario", ancho: 18, ej: local ? 1500000 : 450, ayuda: `Precio por unidad, en ${moneda}, SIN descuento. Mayor a 0.` },
    { h: "Descuento", ancho: 13, ej: 0, ayuda: `Descuento de toda la línea, en ${moneda}. Dejar 0 si no hay.` },
  ];
  if (local) cols.push({ h: "IVA", ancho: 9, ej: "10", ayuda: "10, 5 o EXENTA. Si se deja vacío se toma 10." });

  const productos = XLSX.utils.aoa_to_sheet([cols.map((c) => c.h), cols.map((c) => c.ej)]);
  productos["!cols"] = cols.map((c) => ({ wch: c.ancho }));

  const instr = XLSX.utils.aoa_to_sheet([
    [`PRODUCTOS DE UNA FACTURA ${local ? "LOCAL" : "DE EXPORTACIÓN"}`],
    [],
    ["Cómo se usa"],
    ["1", "Llená una fila por producto en la hoja “Productos”."],
    ["2", "La primera fila dice EJEMPLO en el código: es de muestra y no se importa. Podés escribir encima o dejarla."],
    ["3", "No cambies los títulos de las columnas ni el orden."],
    ["4", `Los importes van en ${moneda}, sin el símbolo de moneda.`],
    ["5", "En el ERP: Facturación → Nueva factura → Cargar desde Excel. Los productos entran en la tabla y se revisan antes de emitir."],
    [],
    ["Qué va en cada columna"],
    ...cols.map((c) => [c.h, c.ayuda]),
    [],
    ["Si algo falla"],
    ["", "Si una fila no tiene descripción, o la cantidad o el precio son 0, esa fila no se carga y el sistema te dice cuál es."],
    ["", "Si el código no existe en el inventario, la fila se carga igual pero sin vincular al producto, y se avisa."],
    ...(local ? [] : [["", "En una factura de exportación todo va exento: no hay columna de IVA."]]),
  ]);
  instr["!cols"] = [{ wch: 18 }, { wch: 96 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, productos, "Productos");
  XLSX.utils.book_append_sheet(wb, instr, "Instrucciones");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders(`productos-factura-${local ? "local" : "exportacion"}`) });
}
