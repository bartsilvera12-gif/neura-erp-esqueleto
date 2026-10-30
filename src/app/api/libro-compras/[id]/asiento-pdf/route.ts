import { NextRequest, NextResponse } from "next/server";
import { getComexCtx } from "@/lib/comex/server";
import { COMPRA_COLS } from "@/lib/compras-libro/server";
import { preAsiento, type LineaCalc } from "@/lib/compras-libro/calculo";
import { comprobanteAsientoHtml, type ComprobanteLinea } from "@/lib/contabilidad/comprobante-asiento-html";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/libro-compras/[id]/asiento-pdf — comprobante imprimible (carta) del
 * asiento de una compra. Como las compras del Libro todavía no se contabilizan
 * solas, arma el MISMO pre-asiento que muestra el formulario, con cuentas y
 * glosa, para imprimir y firmar (Elaborado / Autorizado / Interesado).
 */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return new NextResponse("No autorizado", { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase;

    const [cQ, lQ, cfgQ, pcQ] = await Promise.all([
      sb.from("libro_compras").select(COMPRA_COLS).eq("empresa_id", emp).eq("id", id).maybeSingle(),
      sb.from("libro_compras_lineas")
        .select("cuenta_codigo, explicacion, exentas, gravadas, iva_porcentaje, imputa_iva")
        .eq("empresa_id", emp).eq("compra_id", id).order("orden"),
      sb.from("libro_compras_config")
        .select("cuenta_iva_credito, cuenta_proveedores, cuenta_retencion_iva, cuenta_retencion_renta")
        .eq("empresa_id", emp).maybeSingle(),
      sb.from("plan_cuentas").select("cuenta, denominacion").eq("empresa_id", emp),
    ]);

    const c = cQ.data as Record<string, unknown> | null;
    if (!c) return new NextResponse("El comprobante no existe.", { status: 404 });

    // Tipo de comprobante: cuenta de contrapartida, condición y si es nota de crédito.
    const tipoId = String(c.tipo_id ?? "");
    const { data: tipoData } = await sb
      .from("compra_tipos_comprobante")
      .select("cuenta_codigo, condicion, es_nota_credito, nombre")
      .eq("empresa_id", emp).eq("id", tipoId).maybeSingle();
    const tipo = (tipoData ?? null) as { cuenta_codigo: string | null; condicion: "CONTADO" | "CREDITO"; es_nota_credito: boolean; nombre: string | null } | null;

    const cfg = (cfgQ.data ?? {
      cuenta_iva_credito: "2.01.03.01.002",
      cuenta_proveedores: "2.01.01.04.000",
      cuenta_retencion_iva: null,
      cuenta_retencion_renta: null,
    }) as { cuenta_iva_credito: string; cuenta_proveedores: string; cuenta_retencion_iva: string | null; cuenta_retencion_renta: string | null };

    const nombreCuenta = new Map<string, string>();
    for (const r of (pcQ.data ?? []) as { cuenta: string; denominacion: string }[]) nombreCuenta.set(r.cuenta, r.denominacion);

    const moneda = String(c.moneda ?? "PYG");
    const impacta = String(c.impacta ?? "");
    const imputaGlobal = impacta !== "NO_IMPUTA" && impacta !== "SOLO_IRE";

    const lineasCalc: LineaCalc[] = ((lQ.data ?? []) as Record<string, unknown>[]).map((l) => ({
      cuenta_codigo: (l.cuenta_codigo as string) || null,
      exentas: Number(l.exentas) || 0,
      gravadas: Number(l.gravadas) || 0,
      iva_porcentaje: (Number(l.iva_porcentaje) === 5 || Number(l.iva_porcentaje) === 10 ? Number(l.iva_porcentaje) : 0) as 0 | 5 | 10,
      imputa_iva: imputaGlobal,
    }));

    const nro = String(c.nro_comprobante ?? "");
    const proveedor = String(c.proveedor_nombre ?? "");
    const detalle = (String(c.explicacion ?? "").trim()) || [tipo?.nombre, proveedor, nro].filter(Boolean).join(" ");

    const { lineas: asientoLineas } = preAsiento({
      lineas: lineasCalc,
      moneda,
      condicion: tipo?.condicion ?? "CONTADO",
      esNotaCredito: tipo?.es_nota_credito === true,
      cuentaTipo: tipo?.cuenta_codigo ?? null,
      cuentaIva: cfg.cuenta_iva_credito,
      cuentaProveedores: cfg.cuenta_proveedores,
      cuentaRetIva: cfg.cuenta_retencion_iva,
      cuentaRetRenta: cfg.cuenta_retencion_renta,
      retencionIva: Number(c.retencion_iva) || 0,
      retencionRenta: Number(c.retencion_renta) || 0,
      detalle,
    });

    const lineasPdf: ComprobanteLinea[] = asientoLineas.map((l) => ({
      cuenta_codigo: l.cuenta,
      cuenta_nombre: nombreCuenta.get(l.cuenta) ?? null,
      detalle: l.detalle,
      debe: l.debe,
      haber: l.haber,
    }));

    const origin = new URL(request.url).origin;
    const html = comprobanteAsientoHtml({
      titulo: "COMPROBANTE DE COMPRA",
      numero: nro || String(c.numero_control ?? ""),
      fecha: String(c.fecha ?? "").slice(0, 10),
      glosa: `${tipo?.nombre ? tipo.nombre + " · " : ""}${proveedor}${c.proveedor_ruc ? " · RUC " + String(c.proveedor_ruc) : ""}`,
      estado: "vista_previa",
      moneda,
      tipo_cambio: Number(c.cotizacion) || 1,
      lineas: lineasPdf,
      origin,
    });

    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err) {
    console.error("[/api/libro-compras/:id/asiento-pdf]", err);
    return new NextResponse("No se pudo generar el comprobante del asiento.", { status: 500 });
  }
}
