/**
 * Importación de la mercadería (ítems) de una importación desde Excel.
 * Modo "mixto": los productos que ya existen se identifican por SKU (sin
 * duplicar); los que faltan se crean (nombre + SKU, sin stock). Todos se
 * agregan como ítems de la importación con su cantidad y precio.
 * NO toca stock (el stock recién se mueve al confirmar la recepción).
 */
import { pick, pickNumber } from "@/lib/imports/import-helpers";
import { normalizeUpperText } from "@/lib/text/normalize";
import type { PreviewResponse, PreviewRow } from "@/lib/excel/import-types";

const MONEDAS = new Set(["PYG", "USD", "BOB"]);

export interface ItemParsed {
  row_number: number;
  sku: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  moneda: string;
  errors: string[];
}

export interface ProductoExistente {
  id: string;
  nombre: string;
  activo: boolean | null;
}

export function parseItemsRows(rows: Record<string, string>[], monedaImp: string): ItemParsed[] {
  return rows.map((r, idx) => {
    const errors: string[] = [];
    const sku = normalizeUpperText(pick(r, "SKU", "CODIGO", "SKU_CODIGO"));
    const nombre = normalizeUpperText(pick(r, "NOMBRE", "PRODUCTO", "DESCRIPCION"));
    const cantidad = pickNumber(r, "CANTIDAD", "CANT");
    const precio_unitario = pickNumber(r, "PRECIO_UNITARIO", "PRECIO", "PRECIOUNITARIO");
    const monedaRaw = normalizeUpperText(pick(r, "MONEDA")) || monedaImp;
    const moneda = MONEDAS.has(monedaRaw) ? monedaRaw : monedaImp;
    if (!sku) errors.push("SKU/CÓDIGO obligatorio.");
    if (!(cantidad > 0)) errors.push("CANTIDAD debe ser mayor a 0.");
    return { row_number: idx + 2, sku, nombre, cantidad, precio_unitario, moneda, errors };
  });
}

/** Arma la vista previa: EXISTE (UPDATE) / NUEVO (INSERT) / ERROR. */
export function buildPreviewItems(
  parsed: ItemParsed[],
  productosBySku: Map<string, ProductoExistente>
): PreviewResponse {
  let insertar = 0,
    actualizar = 0,
    errores = 0;
  const skuVistos = new Set<string>();

  const rows: PreviewRow[] = parsed.map((p) => {
    if (p.sku && skuVistos.has(p.sku)) p.errors.push(`SKU "${p.sku}" duplicado en el archivo.`);
    if (p.sku) skuVistos.add(p.sku);

    const ex = p.sku ? productosBySku.get(p.sku) : undefined;
    let action: PreviewRow["action"];
    let estado = "";
    if (p.errors.length > 0) {
      action = "ERROR";
    } else if (ex) {
      if (ex.activo === false) {
        p.errors.push(`"${ex.nombre}" está desactivado en el inventario.`);
        action = "ERROR";
      } else {
        action = "UPDATE"; // ya existe → solo se agrega a la importación
        estado = "Existe";
      }
    } else {
      // No existe → se crea. Necesita nombre.
      if (!p.nombre) {
        p.errors.push("SKU nuevo sin NOMBRE: no se puede crear el producto.");
        action = "ERROR";
      } else {
        action = "INSERT"; // nuevo → se crea y se agrega
        estado = "Nuevo";
      }
    }

    if (action === "INSERT") insertar++;
    else if (action === "UPDATE") actualizar++;
    else if (action === "ERROR") errores++;

    return {
      row_number: p.row_number,
      action,
      warnings: [],
      errors: p.errors,
      data: {
        SKU: p.sku,
        NOMBRE: p.nombre || (ex?.nombre ?? ""),
        CANTIDAD: p.cantidad,
        PRECIO: p.precio_unitario,
        MONEDA: p.moneda,
        ESTADO: estado,
      },
    };
  });

  return {
    summary: { total: parsed.length, insertar, actualizar, omitir: 0, errores, warnings: 0 },
    rows,
    headers: ["SKU", "NOMBRE", "CANTIDAD", "PRECIO_UNITARIO", "MONEDA"],
  };
}

export const ITEMS_TEMPLATE_ROW = {
  SKU: "EJ-001",
  NOMBRE: "EJEMPLO PRODUCTO",
  CANTIDAD: 10,
  PRECIO_UNITARIO: 25.5,
  MONEDA: "USD",
};
