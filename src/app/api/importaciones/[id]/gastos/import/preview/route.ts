import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, operacionCerrada } from "@/lib/comex/server";
import { parseUploadFile } from "@/lib/excel/import";
import { parseGastosRows, buildPreviewGastos, type GastoParsed } from "@/lib/importaciones/gastos-import";
import type { PreviewResponse } from "@/lib/excel/import-types";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

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
    const preview = buildPreviewGastos(parsed);
    await anotarMatchFacturas(ctx.supabase, emp, parsed, preview);
    return NextResponse.json(successResponse(preview));
  } catch (err) {
    console.error("[/api/importaciones/:id/gastos/import/preview]", err);
    return NextResponse.json(errorResponse("No se pudo leer el archivo de gastos."), { status: 500 });
  }
}

/**
 * Para las filas que van al Libro de Compras (lleva IVA o exentas con
 * comprobante completo), marca si existe una factura reutilizable (misma
 * ruc + nro + moneda en sección COMERCIO_EXTERIOR). El cliente ve ANTES de
 * confirmar si va a crear nueva o reutilizar una existente.
 */
async function anotarMatchFacturas(
  sb: AppSupabaseClient,
  empresaId: string,
  parsed: GastoParsed[],
  preview: PreviewResponse,
): Promise<void> {
  // Candidatos: filas sin error, con comprobante REAL (no "0" placeholder) y ruc cargados.
  const nroReal = (s?: string | null) => {
    const t = (s ?? "").trim();
    return t.length >= 3 && !/^0+$/.test(t.replace(/[-\s]/g, ""));
  };
  const candidatos = parsed.map((p, i) => ({ p, row: preview.rows[i] }))
    .filter((x) => x.row.action !== "ERROR")
    .filter((x) => !!x.p.proveedor_ruc?.trim() && nroReal(x.p.comprobante) && !!x.p.timbrado?.trim() && !!x.p.cuenta_codigo?.trim());
  if (!candidatos.length) return;

  // Set único de (ruc, nro) para una sola consulta.
  const rucs = [...new Set(candidatos.map((x) => x.p.proveedor_ruc!))];
  const nros = [...new Set(candidatos.map((x) => x.p.comprobante!))];
  const { data } = await sb
    .from("libro_compras")
    .select("id, numero_control, proveedor_ruc, nro_comprobante, moneda, total, estado")
    .eq("empresa_id", empresaId)
    .eq("seccion", "COMERCIO_EXTERIOR")
    .neq("estado", "anulada")
    .in("proveedor_ruc", rucs)
    .in("nro_comprobante", nros);
  const existentes = (data ?? []) as { id: string; numero_control: string; proveedor_ruc: string; nro_comprobante: string; moneda: string; total: number }[];

  for (const { p, row } of candidatos) {
    const match = existentes.find((e) =>
      e.proveedor_ruc === p.proveedor_ruc &&
      e.nro_comprobante === p.comprobante &&
      e.moneda === p.moneda);
    if (match) {
      const tol = p.moneda === "PYG" ? 1 : 0.01;
      const mismoMonto = Math.abs(Number(match.total) - p.monto) <= tol;
      const msg = mismoMonto
        ? `Esta factura ya está en el Libro de Compras C/E como ${match.numero_control} — se va a reutilizar (sin duplicar).`
        : `Esta factura ya está en el Libro de Compras C/E como ${match.numero_control} con monto distinto (${match.moneda} ${match.total}) — se va a reutilizar la existente.`;
      row.warnings.push(msg);
      preview.summary.warnings++;
      row.data._factura = `↻ Reutiliza ${match.numero_control}`;
    } else if (p.lleva_iva) {
      row.data._factura = "➕ Nueva factura (gravada)";
    } else {
      row.data._factura = "➕ Nueva factura (exenta)";
    }
  }

  // Asegurar que la columna _factura aparece en la tabla del wizard.
  if (!preview.headers.includes("_factura")) preview.headers.push("_factura");
}
