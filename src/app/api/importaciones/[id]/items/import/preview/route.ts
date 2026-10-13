import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx } from "@/lib/comex/server";
import { parseUploadFile } from "@/lib/excel/import";
import { parseItemsRows, buildPreviewItems, type ProductoExistente } from "@/lib/importaciones/items-import";

/** POST (multipart file) → vista previa de los ítems a importar (no escribe nada). */
export async function POST(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;

    const { data: imp } = await ctx.supabase.from("importaciones").select("estado, moneda").eq("empresa_id", emp).eq("id", id).maybeSingle();
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

    // Productos existentes por SKU (para match sin duplicar).
    const { data: prods } = await ctx.supabase.from("productos").select("id, nombre, sku, activo").eq("empresa_id", emp);
    const bySku = new Map<string, ProductoExistente>();
    for (const r of (prods ?? []) as { id: string; nombre: string; sku: string | null; activo: boolean | null }[]) {
      if (r.sku) bySku.set(r.sku.toUpperCase(), { id: r.id, nombre: r.nombre, activo: r.activo });
    }

    return NextResponse.json(successResponse(buildPreviewItems(parsed, bySku)));
  } catch (err) {
    console.error("[/api/importaciones/:id/items/import/preview]", err);
    return NextResponse.json(errorResponse("No se pudo generar la vista previa."), { status: 500 });
  }
}
