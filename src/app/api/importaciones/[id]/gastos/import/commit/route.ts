import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, operacionCerrada, nombreUsuario, registrarHistorial } from "@/lib/comex/server";
import { parseUploadFile } from "@/lib/excel/import";
import { parseGastosRows, buildPreviewGastos } from "@/lib/importaciones/gastos-import";
import { crearFacturaDeGasto } from "@/lib/comex/gasto-factura";
import type { CommitResponse } from "@/lib/excel/import-types";

/** POST (multipart file) → crea todos los gastos válidos de la importación. */
export async function POST(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase;

    const { data: imp } = await sb.from("importaciones").select("estado, moneda").eq("empresa_id", emp).eq("id", id).maybeSingle();
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
    const prev = buildPreviewGastos(parsed);
    const hoy = new Date().toISOString().slice(0, 10);

    const out: CommitResponse = {
      summary: { total: parsed.length, inserted: 0, updated: 0, skipped: 0, errors: 0, warnings: 0 },
      warnings: [],
      errors: [],
    };

    let facturasCreadas = 0;
    for (let i = 0; i < parsed.length; i++) {
      const g = parsed[i];
      if (prev.rows[i].action === "ERROR") {
        out.summary.errors++;
        out.errors.push(`Fila ${g.row_number}: ${g.errors.join("; ")}`);
        continue;
      }
      const fecha = g.fecha ?? hoy;
      try {
        // 1) Se carga el gasto de la operación.
        const ins = await sb
          .from("comex_gastos")
          .insert({
            empresa_id: emp,
            origen_tipo: "IMPORTACION",
            origen_id: id,
            usuario_nombre: nombreUsuario(ctx.auth),
            fecha,
            tipo: g.tipo,
            descripcion: g.descripcion,
            proveedor_nombre: g.proveedor_nombre,
            proveedor_ruc: g.proveedor_ruc,
            comprobante: g.comprobante,
            timbrado: g.timbrado,
            cuenta_codigo: g.cuenta_codigo,
            monto: g.monto,
            moneda: g.moneda,
            tipo_cambio: g.tipo_cambio,
            pagado: g.pagado,
            lleva_iva: g.lleva_iva,
            iva_porcentaje: g.iva_porcentaje,
          })
          .select("id")
          .single();
        if (ins.error) throw new Error(ins.error.message);
        const gastoId = (ins.data as { id: string }).id;

        // 2) Si lleva IVA, se genera la factura en el Libro de Compras y se enlaza.
        //    Si falla, se revierte el gasto para no dejarlo sin su factura.
        if (g.lleva_iva) {
          try {
            const { compraId } = await crearFacturaDeGasto(sb, ctx.auth, {
              fecha,
              tipo: g.tipo,
              descripcion: g.descripcion,
              proveedor_nombre: g.proveedor_nombre,
              proveedor_ruc: g.proveedor_ruc,
              comprobante: g.comprobante,
              timbrado: g.timbrado,
              cuenta_codigo: g.cuenta_codigo,
              monto: g.monto,
              moneda: g.moneda,
              tipo_cambio: g.tipo_cambio,
              iva_porcentaje: g.iva_porcentaje,
            });
            await sb.from("comex_gastos").update({ libro_compra_id: compraId }).eq("empresa_id", emp).eq("id", gastoId);
            facturasCreadas++;
          } catch (e) {
            await sb.from("comex_gastos").delete().eq("empresa_id", emp).eq("id", gastoId);
            throw e;
          }
        }
        out.summary.inserted++;
      } catch (e) {
        out.summary.errors++;
        out.errors.push(`Fila ${g.row_number}: ${(e as Error).message.slice(0, 200)}`);
      }
    }

    await registrarHistorial(ctx.supabase, ctx.auth, "IMPORTACION", id, "IMPORTAR_GASTOS_EXCEL", {
      gastos_creados: out.summary.inserted,
      facturas_libro_compras: facturasCreadas,
      errores: out.summary.errors,
    });

    return NextResponse.json(successResponse(out));
  } catch (err) {
    console.error("[/api/importaciones/:id/gastos/import/commit]", err);
    return NextResponse.json(errorResponse("No se pudieron importar los gastos."), { status: 500 });
  }
}
