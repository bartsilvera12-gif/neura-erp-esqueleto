import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { comprobanteAsientoHtml, type ComprobanteLinea } from "@/lib/contabilidad/comprobante-asiento-html";

export const dynamic = "force-dynamic";

/**
 * GET /api/gastos/[id]/asiento-pdf — comprobante imprimible (carta) del asiento
 * de un gasto con recibo (sin factura). Arma un asiento simple sin IVA:
 *   Debe  → cuenta contable del gasto
 *   Haber → cuenta del banco o caja chica de donde salió el dinero
 * Mismo formato que el asiento del Libro de Compras, para imprimir y firmar.
 */
export async function GET(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return new NextResponse("No autorizado", { status: 401 });
    const { supabase, auth } = ctx;
    const emp = auth.empresa_id;
    const origin = new URL(request.url).origin;

    const gq = await supabase.from("gastos").select("*").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (gq.error || !gq.data) return new NextResponse("Gasto no encontrado", { status: 404 });
    const g = gq.data as Record<string, unknown>;

    const moneda = "PYG";
    const monto = Number(g.monto) || 0;

    // Cuenta del gasto (Debe).
    let cuentaGastoCod = "";
    let cuentaGastoNom: string | null = null;
    if (g.cuenta_contable_id) {
      const cq = await supabase
        .from("plan_cuentas")
        .select("cuenta, denominacion")
        .eq("empresa_id", emp)
        .eq("id", String(g.cuenta_contable_id))
        .maybeSingle();
      const c = cq.data as { cuenta: string; denominacion: string } | null;
      if (c) {
        cuentaGastoCod = c.cuenta;
        cuentaGastoNom = c.denominacion;
      }
    }

    // Cuenta de contrapartida (Haber): banco o caja chica de donde salió el dinero.
    let contraCod = "";
    let contraNom: string | null = null;
    if (g.entidad_bancaria_id) {
      const bq = await supabase
        .from("entidades_bancarias")
        .select("nombre, cuenta_contable_codigo")
        .eq("empresa_id", emp)
        .eq("id", String(g.entidad_bancaria_id))
        .maybeSingle();
      const b = bq.data as { nombre?: string; cuenta_contable_codigo?: string | null } | null;
      contraCod = b?.cuenta_contable_codigo ?? "";
      contraNom = b?.nombre ?? null;
    } else if (g.caja_chica_id) {
      const kq = await supabase
        .from("cajas_chicas")
        .select("nombre, cuenta_contable_codigo")
        .eq("empresa_id", emp)
        .eq("id", String(g.caja_chica_id))
        .maybeSingle();
      const k = kq.data as { nombre?: string; cuenta_contable_codigo?: string | null } | null;
      contraCod = k?.cuenta_contable_codigo ?? "";
      contraNom = k?.nombre ?? null;
    }

    // Si la contrapartida tiene código de cuenta, buscamos su denominación oficial del plan.
    if (contraCod) {
      const pc = await supabase
        .from("plan_cuentas")
        .select("denominacion")
        .eq("empresa_id", emp)
        .eq("cuenta", contraCod)
        .maybeSingle();
      const nom = (pc.data as { denominacion?: string } | null)?.denominacion;
      if (nom) contraNom = nom;
    }

    const descripcion = String(g.descripcion ?? "").trim() || String(g.categoria ?? "Gasto");

    const lineas: ComprobanteLinea[] = [
      { cuenta_codigo: cuentaGastoCod || "(sin cuenta)", cuenta_nombre: cuentaGastoNom, detalle: descripcion, debe: monto, haber: 0 },
      { cuenta_codigo: contraCod || "(sin cuenta)", cuenta_nombre: contraNom, detalle: "Pago del gasto", debe: 0, haber: monto },
    ];

    const proveedor = String(g.proveedor_nombre ?? "").trim();
    const glosa = [String(g.categoria ?? "").trim(), proveedor, descripcion].filter(Boolean).join(" · ");

    const html = comprobanteAsientoHtml({
      titulo: "COMPROBANTE DE RECIBO",
      numero: String(g.recibo_numero ?? "") || String(g.fecha ?? "").slice(0, 10),
      fecha: String(g.fecha ?? "").slice(0, 10),
      glosa,
      estado: "vista_previa",
      moneda,
      tipo_cambio: 1,
      lineas,
      origin,
    });

    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err) {
    console.error("[/api/gastos/:id/asiento-pdf]", err);
    return new NextResponse("No se pudo generar el comprobante del asiento.", { status: 500 });
  }
}
