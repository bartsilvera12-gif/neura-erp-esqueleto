import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { buildFacturaExportacionPdf } from "@/lib/facturas-exportacion/pdf";
import type { FacturaConfigFiscal, FacturaExportacion, FacturaExportacionItem } from "@/lib/facturas-exportacion/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParams.params;
  const ctx = await getTenantSupabaseFromAuthWithRol(request);
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const empresaId = ctx.auth.empresa_id;

  const cab = await ctx.supabase
    .from("facturas_exportacion")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("id", id)
    .maybeSingle();
  if (cab.error || !cab.data) return new Response("Not found", { status: 404 });
  const factura = cab.data as unknown as FacturaExportacion;
  if (factura.estado === "BORRADOR")
    return new Response("Un borrador no tiene número todavía: emitilo para generar el PDF.", { status: 400 });

  // Auditoría: la primera vez es impresión, las siguientes son reimpresiones (mismo número, sin correlativo nuevo).
  const previas = await ctx.supabase
    .from("facturas_exportacion_auditoria")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("factura_id", id)
    .in("accion", ["IMPRIMIR", "REIMPRIMIR"]);
  await ctx.supabase.from("facturas_exportacion_auditoria").insert({
    empresa_id: empresaId,
    factura_id: id,
    accion: (previas.count ?? 0) > 0 ? "REIMPRIMIR" : "IMPRIMIR",
    detalle: { numero: factura.numero_formateado },
    usuario_id: ctx.auth.user.id,
    usuario_nombre: ctx.auth.nombre ?? ctx.auth.user.email ?? null,
  });

  const [items, cfg] = await Promise.all([
    ctx.supabase.from("facturas_exportacion_items").select("*").eq("empresa_id", empresaId).eq("factura_id", id).order("orden"),
    ctx.supabase
      .from("facturas_exportacion_config")
      .select("timbrado, vigencia_desde, vigencia_hasta, ruc, autoimpresor_nro")
      .eq("empresa_id", empresaId)
      .eq("establecimiento", factura.establecimiento)
      .eq("punto_expedicion", factura.punto_expedicion)
      .eq("timbrado", factura.timbrado)
      .maybeSingle(),
  ]);

  const fiscal: FacturaConfigFiscal = (cfg.data as unknown as FacturaConfigFiscal | null) ?? {
    timbrado: factura.timbrado,
    vigencia_desde: "",
    vigencia_hasta: "",
    ruc: null,
    autoimpresor_nro: null,
  };

  const pdf = await buildFacturaExportacionPdf(
    { ...factura, items: (items.data ?? []) as unknown as FacturaExportacionItem[] },
    fiscal
  );

  const nombre = factura.tipo === "LOCAL" ? "factura" : "factura-exportacion";
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre}-${factura.numero_formateado}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
