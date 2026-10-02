import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { parseUploadFile } from "@/lib/excel/import";
import { traerTodo } from "@/lib/comex/server";

/**
 * POST (form-data: file, tipo) — lee el Excel con los productos de una factura
 * y devuelve las líneas listas para cargarlas en el formulario. NO guarda nada:
 * el usuario las revisa y recién después emite.
 *
 * El código se busca en el inventario por SKU; si no está, la línea se carga
 * igual con lo que diga el Excel y se avisa.
 */
const num = (v: unknown) => {
  const s = String(v ?? "").trim().replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const txt = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
/** Busca el valor de una columna aceptando variantes del encabezado. */
const col = (fila: Record<string, string>, ...nombres: string[]) => {
  for (const n of nombres) {
    for (const k of Object.keys(fila)) {
      if (k.trim().toLowerCase().replace(/[\s._-]/g, "") === n) return fila[k];
    }
  }
  return "";
};

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json(errorResponse("Falta el archivo."), { status: 400 });
    const tipo = String(form?.get("tipo") ?? "") === "LOCAL" ? "LOCAL" : "EXPORTACION";

    const parsed = await parseUploadFile(file);
    if ("error" in parsed) return NextResponse.json(errorResponse(parsed.error), { status: 400 });

    const filas = parsed.rows.filter((f) => Object.values(f).some((v) => String(v ?? "").trim() !== ""));
    if (!filas.length) return NextResponse.json(errorResponse("El archivo está vacío."), { status: 400 });

    // Productos del inventario, para resolver el código y completar nombre y unidad.
    const productos = await traerTodo<{ id: string; nombre: string; sku: string | null; unidad_medida: string | null; precio_venta: number | null }>((a, b) =>
      ctx.supabase.from("productos").select("id, nombre, sku, unidad_medida, precio_venta").eq("empresa_id", emp).eq("activo", true).order("id").range(a, b)
    );
    const porSku = new Map(productos.filter((p) => p.sku).map((p) => [String(p.sku).trim().toLowerCase(), p]));

    const items: Record<string, unknown>[] = [];
    const avisos: string[] = [];
    const errores: string[] = [];

    filas.forEach((f, i) => {
      const linea = i + 2; // +1 por el encabezado, +1 porque Excel arranca en 1
      const codigo = txt(col(f, "codigo", "código", "sku"), 40);
      const descripcionExcel = txt(col(f, "descripcion", "descripción", "producto", "detalle"));
      const cantidad = num(col(f, "cantidad", "cant"));
      const precio = num(col(f, "preciounitario", "precio", "preciounit"));
      const descuento = Math.max(0, num(col(f, "descuento", "desc")));
      const ivaRaw = txt(col(f, "iva", "ivaporcentaje"), 10).replace("%", "").toUpperCase();

      const p = codigo ? porSku.get(codigo.toLowerCase()) : undefined;
      const descripcion = descripcionExcel || p?.nombre || "";
      if (!descripcion) {
        errores.push(`Fila ${linea}: sin descripción ni código que exista en el inventario.`);
        return;
      }
      if (!(cantidad > 0)) {
        errores.push(`Fila ${linea} (${descripcion}): la cantidad tiene que ser mayor a 0.`);
        return;
      }
      if (!(precio > 0)) {
        errores.push(`Fila ${linea} (${descripcion}): el precio unitario tiene que ser mayor a 0.`);
        return;
      }
      if (codigo && !p) avisos.push(`Fila ${linea}: el código "${codigo}" no está en el inventario. Se carga igual, sin vincular.`);

      items.push({
        producto_id: p?.id ?? "",
        codigo: p?.sku ?? codigo,
        descripcion,
        unidad: txt(col(f, "unidad", "unidaddemedida"), 10) || p?.unidad_medida || "UN",
        cantidad: String(cantidad),
        precio_unitario: String(precio),
        descuento: descuento ? String(descuento) : "",
        iva_tipo: tipo === "EXPORTACION" ? "EXENTA" : ivaRaw === "5" ? "5" : ivaRaw === "EXENTA" || ivaRaw === "E" ? "EXENTA" : "10",
      });
    });

    if (!items.length)
      return NextResponse.json(errorResponse(`No se pudo cargar ninguna fila. ${errores.slice(0, 3).join(" ")}`), { status: 400 });

    return NextResponse.json(successResponse({ items, avisos, errores, total_filas: filas.length }));
  } catch (err) {
    console.error("[/api/facturas-exportacion/items/importar]", err);
    return NextResponse.json(errorResponse("No se pudo leer el archivo."), { status: 500 });
  }
}
