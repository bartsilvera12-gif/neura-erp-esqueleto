import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { buildFacturaExportacionPdf } from "@/lib/facturas-exportacion/pdf";
import type { FacturaExportacion, FacturaExportacionItem } from "@/lib/facturas-exportacion/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParams.params;
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const cab = await ctx.supabase
    .from("facturas_exportacion")
    .select("*")
    .eq("empresa_id", ctx.auth.empresa_id)
    .eq("id", id)
    .maybeSingle();
  if (cab.error || !cab.data) return new Response("Not found", { status: 404 });
  const items = await ctx.supabase
    .from("facturas_exportacion_items")
    .select("*")
    .eq("empresa_id", ctx.auth.empresa_id)
    .eq("factura_id", id)
    .order("orden");

  const factura = {
    ...(cab.data as unknown as FacturaExportacion),
    items: (items.data ?? []) as unknown as FacturaExportacionItem[],
  };
  const pdf = await buildFacturaExportacionPdf(factura);
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="factura-exportacion-${factura.numero_formateado}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
