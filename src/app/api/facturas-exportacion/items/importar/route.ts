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
 *
 * Si la fila pide "Crear en inventario" y ese código todavía no existe, el
 * producto se da de alta con los datos del Excel y la línea queda vinculada.
 * Un código que ya existe nunca se pisa.
 */
const num = (v: unknown) => {
  const s = String(v ?? "").trim().replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const txt = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
/** "Precio unitario" y "precio_unitario" son la misma columna: se compara sin tildes ni separadores. */
const clave = (v: string) =>
  v.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s._-]/g, "");
const col = (fila: Record<string, string>, ...nombres: string[]) => {
  for (const n of nombres) {
    for (const k of Object.keys(fila)) {
      if (clave(k) === n) return fila[k];
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

    // Depósitos y categorías, para resolverlos por nombre al dar de alta.
    const [ubicQ, catQ] = await Promise.all([
      ctx.supabase.from("inventario_ubicaciones").select("id, nombre").eq("empresa_id", emp),
      ctx.supabase.from("categorias_productos").select("id, nombre").eq("empresa_id", emp),
    ]);
    const porNombre = (rows: unknown) =>
      new Map(((rows ?? []) as { id: string; nombre: string }[]).map((x) => [x.nombre.trim().toLowerCase(), x.id]));
    const ubicaciones = porNombre(ubicQ.data);
    const categorias = porNombre(catQ.data);

    const items: Record<string, unknown>[] = [];
    const avisos: string[] = [];
    const errores: string[] = [];
    // Los códigos que no están en el inventario se devuelven aparte: en pantalla
    // se resumen en una línea, para no tapar los errores de verdad.
    const sinVincular: string[] = [];

    let ejemplos = 0;
    const creados: string[] = [];
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      const linea = i + 2; // +1 por el encabezado, +1 porque Excel arranca en 1
      const codigo = txt(col(f, "codigo", "sku"), 40);
      // La fila de muestra de la plantilla no se carga.
      if (codigo.toUpperCase() === "EJEMPLO") {
        ejemplos++;
        continue;
      }
      const descripcionExcel = txt(col(f, "descripcion", "producto", "detalle"));
      const cantidad = num(col(f, "cantidad", "cant"));
      const precio = num(col(f, "preciounitario", "precio", "preciounit"));
      const descuento = Math.max(0, num(col(f, "descuento", "desc")));
      const ivaRaw = txt(col(f, "iva", "ivaporcentaje"), 10).replace("%", "").toUpperCase();

      let p = codigo ? porSku.get(codigo.toLowerCase()) : undefined;
      const descripcion = descripcionExcel || p?.nombre || "";
      if (!descripcion) {
        errores.push(`Fila ${linea}: sin descripción ni código que exista en el inventario.`);
        continue;
      }
      if (!(cantidad > 0)) {
        errores.push(`Fila ${linea} (${descripcion}): la cantidad tiene que ser mayor a 0.`);
        continue;
      }
      if (!(precio > 0)) {
        errores.push(`Fila ${linea} (${descripcion}): el precio unitario tiene que ser mayor a 0.`);
        continue;
      }

      // Alta en el inventario, solo si la fila lo pide y el código no existe.
      const quiereCrear = /^(si|sí|s|x|1|true|verdadero)$/i.test(txt(col(f, "creareninventario", "crearinventario", "crearproducto", "crear"), 12));
      if (quiereCrear && !p) {
        if (!codigo) {
          errores.push(`Fila ${linea} (${descripcion}): para crearlo en el inventario hace falta el código.`);
          continue;
        }
        const unidadAlta = txt(col(f, "unidad", "unidaddemedida"), 20) || "UNIDAD";
        const depNombre = txt(col(f, "deposito", "ubicacion"), 80);
        const catNombre = txt(col(f, "categoria"), 80);
        const depId = depNombre ? ubicaciones.get(depNombre.toLowerCase()) : undefined;
        const catId = catNombre ? categorias.get(catNombre.toLowerCase()) : undefined;
        if (depNombre && !depId) avisos.push(`Fila ${linea}: el depósito "${depNombre}" no existe; el producto se creó sin depósito.`);
        if (catNombre && !catId) avisos.push(`Fila ${linea}: la categoría "${catNombre}" no existe; el producto se creó sin categoría.`);

        const { data: nuevo, error: eNuevo } = await ctx.supabase
          .from("productos")
          .insert({
            empresa_id: emp,
            nombre: descripcion.toUpperCase(),
            sku: codigo.toUpperCase(),
            unidad_medida: unidadAlta.toUpperCase(),
            precio_venta: precio,
            costo_promedio: Math.max(0, num(col(f, "costo", "costounitario"))),
            stock_actual: Math.max(0, num(col(f, "stockinicial", "stock"))),
            categoria_principal_id: catId ?? null,
            ubicacion_principal_id: depId ?? null,
            activo: true,
          })
          .select("id, nombre, sku, unidad_medida, precio_venta")
          .single();
        if (eNuevo) {
          avisos.push(`Fila ${linea}: no se pudo crear "${codigo}" en el inventario (${eNuevo.message}). La línea se carga sin vincular.`);
        } else {
          p = nuevo as { id: string; nombre: string; sku: string | null; unidad_medida: string | null; precio_venta: number | null };
          porSku.set(codigo.toLowerCase(), p);
          creados.push(codigo.toUpperCase());
        }
      }

      if (codigo && !p) sinVincular.push(codigo);

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
    }

    if (!items.length)
      return NextResponse.json(errorResponse(`No se pudo cargar ninguna fila. ${errores.slice(0, 3).join(" ")}`), { status: 400 });

    return NextResponse.json(
      successResponse({ items, avisos, errores, sin_vincular: sinVincular, creados, total_filas: filas.length - ejemplos })
    );
  } catch (err) {
    console.error("[/api/facturas-exportacion/items/importar]", err);
    return NextResponse.json(errorResponse("No se pudo leer el archivo."), { status: 500 });
  }
}
