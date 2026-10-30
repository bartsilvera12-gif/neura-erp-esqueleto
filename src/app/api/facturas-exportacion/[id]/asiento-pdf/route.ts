import { NextRequest, NextResponse } from "next/server";
import { getComexCtx } from "@/lib/comex/server";
import { comprobanteAsientoHtml, type ComprobanteLinea } from "@/lib/contabilidad/comprobante-asiento-html";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const num = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * GET /api/facturas-exportacion/[id]/asiento-pdf — comprobante imprimible (carta)
 * del asiento de una factura de venta, para imprimir y firmar.
 *
 * Las facturas de venta no se contabilizan solas, así que se arma el asiento de
 * la venta como vista previa, con las cuentas configuradas en Contabilidad:
 *   Debe  Caja (contado) o Clientes (crédito)      = total
 *   Haber Ventas gravadas (neto) + Ventas exentas + IVA Débito 5% / 10%
 * Los montos gravados vienen con el IVA incluido (criterio Paraguay).
 */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return new NextResponse("No autorizado", { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase;

    const [fQ, cfgQ, pcQ] = await Promise.all([
      sb.from("facturas_exportacion")
        .select("id, numero_formateado, numero, fecha, moneda, tipo_cambio, cliente_nombre, cliente_documento, condicion_venta, total, total_exentas, total_gravado5, total_gravado10, iva5, iva10, estado")
        .eq("empresa_id", emp).eq("id", id).maybeSingle(),
      sb.from("configuracion_contable")
        .select("cuenta_clientes_id, cuenta_caja_id, cuenta_banco_id, cuenta_ventas_gravadas_id, cuenta_ventas_exentas_id, cuenta_ventas_servicios_id, cuenta_iva_debito_5_id, cuenta_iva_debito_10_id")
        .eq("empresa_id", emp).maybeSingle(),
      sb.from("plan_cuentas").select("id, cuenta, denominacion").eq("empresa_id", emp),
    ]);

    const f = fQ.data as Record<string, unknown> | null;
    if (!f) return new NextResponse("La factura no existe.", { status: 404 });

    const cfg = (cfgQ.data ?? {}) as Record<string, string | null>;
    const porId = new Map<string, { cuenta: string; denominacion: string }>();
    for (const r of (pcQ.data ?? []) as { id: string; cuenta: string; denominacion: string }[]) porId.set(r.id, r);

    // Resuelve una cuenta de config (uuid) a código + nombre; placeholder si falta.
    const resolver = (cuentaId: string | null, etiqueta: string): { codigo: string; nombre: string } => {
      const c = cuentaId ? porId.get(cuentaId) : undefined;
      return c ? { codigo: c.cuenta, nombre: c.denominacion } : { codigo: "(sin cuenta)", nombre: `⚠ Configurar cuenta de ${etiqueta}` };
    };

    const exentas = num(f.total_exentas);
    const grav5 = num(f.total_gravado5);
    const grav10 = num(f.total_gravado10);
    const iva5 = num(f.iva5);
    const iva10 = num(f.iva10);
    const r0 = (n: number) => Math.round(n);
    const total = r0(exentas + grav5 + grav10); // IVA incluido en gravadas
    const ventaNeta = r0(exentas + (grav5 - iva5) + (grav10 - iva10));

    const contado = String(f.condicion_venta ?? "").toUpperCase().startsWith("CONTADO");
    const contra = contado
      ? resolver(cfg.cuenta_caja_id ?? cfg.cuenta_banco_id, "Caja/Banco")
      : resolver(cfg.cuenta_clientes_id, "Clientes");
    const ctaVentas = resolver(cfg.cuenta_ventas_gravadas_id ?? cfg.cuenta_ventas_servicios_id ?? cfg.cuenta_ventas_exentas_id, "Ventas");
    const ctaVentasEx = resolver(cfg.cuenta_ventas_exentas_id ?? cfg.cuenta_ventas_gravadas_id, "Ventas exentas");
    const ctaIva5 = resolver(cfg.cuenta_iva_debito_5_id, "IVA Débito 5%");
    const ctaIva10 = resolver(cfg.cuenta_iva_debito_10_id, "IVA Débito 10%");

    const cliente = String(f.cliente_nombre ?? "");
    const detalle = `Venta ${f.numero_formateado ?? f.numero ?? ""} · ${cliente}`.trim();
    const L = (c: { codigo: string; nombre: string }, debe: number, haber: number): ComprobanteLinea =>
      ({ cuenta_codigo: c.codigo, cuenta_nombre: c.nombre, detalle, debe, haber });

    const lineas: ComprobanteLinea[] = [L(contra, total, 0)];
    const ventaGravNeta = r0((grav5 - iva5) + (grav10 - iva10));
    if (ventaGravNeta > 0 && exentas > 0) {
      lineas.push(L(ctaVentas, 0, ventaGravNeta));
      lineas.push(L(ctaVentasEx, 0, exentas));
    } else {
      // Solo exentas, o solo gravadas: una sola cuenta de ventas por el neto total.
      const cuentaVta = exentas > 0 && ventaGravNeta === 0 ? ctaVentasEx : ctaVentas;
      lineas.push(L(cuentaVta, 0, ventaNeta));
    }
    if (iva5 > 0) lineas.push(L(ctaIva5, 0, r0(iva5)));
    if (iva10 > 0) lineas.push(L(ctaIva10, 0, r0(iva10)));

    const origin = new URL(request.url).origin;
    const moneda = String(f.moneda ?? "PYG");
    const html = comprobanteAsientoHtml({
      titulo: "COMPROBANTE DE VENTA",
      numero: String(f.numero_formateado ?? f.numero ?? ""),
      fecha: String(f.fecha ?? "").slice(0, 10),
      glosa: `${contado ? "VENTA CONTADO" : "VENTA CRÉDITO"} · ${cliente}${f.cliente_documento ? " · " + String(f.cliente_documento) : ""}`,
      estado: "vista_previa",
      moneda,
      tipo_cambio: Number(f.tipo_cambio) || 1,
      lineas,
      origin,
    });

    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err) {
    console.error("[/api/facturas-exportacion/:id/asiento-pdf]", err);
    return new NextResponse("No se pudo generar el comprobante del asiento.", { status: 500 });
  }
}
