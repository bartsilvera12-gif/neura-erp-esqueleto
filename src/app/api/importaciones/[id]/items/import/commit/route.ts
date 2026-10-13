import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, registrarHistorial } from "@/lib/comex/server";
import { parseUploadFile } from "@/lib/excel/import";
import { parseItemsRows, buildPreviewItems, type ProductoExistente } from "@/lib/importaciones/items-import";
import type { CommitResponse } from "@/lib/excel/import-types";

/** POST (multipart file) → crea los faltantes y agrega todos los ítems. NO toca stock. */
export async function POST(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase;

    const { data: imp } = await sb.from("importaciones").select("estado, moneda").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (!imp) return NextResponse.json(errorResponse("Importación no encontrada."), { status: 404 });
    if ((imp as { estado: string }).estado !== "borrador")
      return NextResponse.json(errorResponse("La mercadería solo se puede importar mientras la importación está en borrador."), { status: 400 });

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(errorResponse("Form-data inválido."), { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json(errorResponse("Falta el archivo."), { status: 400 });
    const parsedFile = await parseUploadFile(file);
    if ("error" in parsedFile) return NextResponse.json(errorResponse(parsedFile.error), { status: 400 });

    const parsed = parseItemsRows(parsedFile.rows, (imp as { moneda: string }).moneda);

    // Productos existentes por SKU (id, nombre, unidad, activo).
    const { data: prods } = await sb.from("productos").select("id, nombre, sku, activo, unidad_medida").eq("empresa_id", emp);
    const bySku = new Map<string, ProductoExistente & { unidad: string | null }>();
    for (const r of (prods ?? []) as { id: string; nombre: string; sku: string | null; activo: boolean | null; unidad_medida: string | null }[]) {
      if (r.sku) bySku.set(r.sku.toUpperCase(), { id: r.id, nombre: r.nombre, activo: r.activo, unidad: r.unidad_medida });
    }

    const prev = buildPreviewItems(parsed, bySku);
    const out: CommitResponse = {
      summary: { total: parsed.length, inserted: 0, updated: 0, skipped: 0, errors: 0, warnings: 0 },
      warnings: [],
      errors: [],
    };

    for (let i = 0; i < parsed.length; i++) {
      const p0 = parsed[i];
      const action = prev.rows[i].action;
      if (action === "ERROR") {
        out.summary.errors++;
        out.errors.push(`Fila ${p0.row_number}: ${p0.errors.join("; ")}`);
        continue;
      }
      try {
        let productoId: string;
        let nombre: string;
        let unidad: string | null = null;
        let creado = false;
        const ex = bySku.get(p0.sku);
        if (ex) {
          productoId = ex.id;
          nombre = ex.nombre;
          unidad = ex.unidad;
        } else {
          // Crear el producto faltante (minimal: nombre + sku; SIN stock).
          const ins = await sb.from("productos").insert({ empresa_id: emp, nombre: p0.nombre, sku: p0.sku }).select("id, nombre, unidad_medida").single();
          if (ins.error) throw new Error(ins.error.message);
          const np = ins.data as { id: string; nombre: string; unidad_medida: string | null };
          productoId = np.id;
          nombre = np.nombre;
          unidad = np.unidad_medida;
          creado = true;
          // Registrar en el mapa por si el mismo SKU se repite más abajo.
          bySku.set(p0.sku, { id: np.id, nombre: np.nombre, activo: true, unidad: np.unidad_medida });
        }

        const itemIns = await sb.from("importacion_items").insert({
          empresa_id: emp,
          importacion_id: id,
          producto_id: productoId,
          producto_nombre: nombre,
          sku: p0.sku,
          unidad,
          cantidad: p0.cantidad,
          precio_unitario: p0.precio_unitario,
          moneda: p0.moneda,
          subtotal: p0.cantidad * p0.precio_unitario,
        });
        if (itemIns.error) throw new Error(itemIns.error.message);

        if (creado) out.summary.inserted++;
        else out.summary.updated++;
      } catch (e) {
        out.summary.errors++;
        out.errors.push(`Fila ${p0.row_number}: ${(e as Error).message.slice(0, 160)}`);
      }
    }

    await registrarHistorial(ctx.supabase, ctx.auth, "IMPORTACION", id, "IMPORTAR_MERCADERIA_EXCEL", {
      productos_nuevos: out.summary.inserted,
      productos_existentes: out.summary.updated,
      errores: out.summary.errors,
    });

    return NextResponse.json(successResponse(out));
  } catch (err) {
    console.error("[/api/importaciones/:id/items/import/commit]", err);
    return NextResponse.json(errorResponse("No se pudo importar la mercadería."), { status: 500 });
  }
}
