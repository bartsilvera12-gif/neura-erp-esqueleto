import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx } from "@/lib/comex/server";

/**
 * GET ?exportacion_id= — facturas de exportación emitidas y notas de remisión
 * que todavía no están vinculadas a otro envío (más las de este, si tiene).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const propia = new URL(request.url).searchParams.get("exportacion_id");
    const [fac, nrs, usadas] = await Promise.all([
      ctx.supabase
        .from("facturas_exportacion")
        .select("id, numero_formateado, fecha, cliente_nombre, moneda, total, estado, prueba")
        .eq("empresa_id", emp)
        .eq("tipo", "EXPORTACION")
        .eq("estado", "EMITIDA")
        .order("fecha", { ascending: false })
        .limit(300),
      ctx.supabase
        .from("notas_remision")
        .select("id, numero, fecha, destino_nombre, estado")
        .eq("empresa_id", emp)
        .neq("estado", "rechazada")
        .order("fecha", { ascending: false })
        .limit(300),
      ctx.supabase.from("exportaciones").select("id, factura_id, nota_remision_id").eq("empresa_id", emp),
    ]);
    const err = fac.error ?? nrs.error ?? usadas.error;
    if (err) throw new Error(err.message);
    const otras = ((usadas.data ?? []) as { id: string; factura_id: string | null; nota_remision_id: string | null }[]).filter((e) => e.id !== propia);
    const facturasUsadas = new Set(otras.map((e) => e.factura_id).filter(Boolean));
    const nrUsadas = new Set(otras.map((e) => e.nota_remision_id).filter(Boolean));
    return NextResponse.json(
      successResponse({
        facturas: ((fac.data ?? []) as { id: string }[]).filter((f) => !facturasUsadas.has(f.id)),
        remisiones: ((nrs.data ?? []) as { id: string }[]).filter((n) => !nrUsadas.has(n.id)),
      })
    );
  } catch (err) {
    console.error("[/api/exportaciones/opciones GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar las facturas y remisiones."), { status: 500 });
  }
}
