import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, operacionCerrada } from "@/lib/comex/server";
import { parseUploadFile } from "@/lib/excel/import";
import { parseGastosRows, buildPreviewGastos } from "@/lib/importaciones/gastos-import";

/** POST (multipart file) → vista previa de los gastos a importar (no escribe nada). */
export async function POST(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;

    const { data: imp } = await ctx.supabase.from("importaciones").select("estado, moneda").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (!imp) return NextResponse.json(errorResponse("Importación no encontrada."), { status: 404 });
    if (operacionCerrada((imp as { estado: string }).estado))
      return NextResponse.json(errorResponse("La importación está cerrada o anulada."), { status: 400 });

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

    const parsed = parseGastosRows(parsedFile.rows, (imp as { moneda: string }).moneda);
    return NextResponse.json(successResponse(buildPreviewGastos(parsed)));
  } catch (err) {
    console.error("[/api/importaciones/:id/gastos/import/preview]", err);
    return NextResponse.json(errorResponse("No se pudo leer el archivo de gastos."), { status: 500 });
  }
}
