import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esUuid, getComexCtx, textoBusqueda } from "@/lib/comex/server";
import { COMPRA_COLS, ErrorValidacion, guardarCompra } from "@/lib/compras-libro/server";
import { esSeccion } from "@/lib/secciones";
import { anioGestionActiva, rangoGestion, gestionCerrada } from "@/lib/gestion/gestion-activa";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { contabilizarCompra } from "@/lib/contabilidad/compras-asientos-pg";

/** GET ?desde=&hasta=&tipo=&estado=&q= — comprobantes del libro de compras. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sp = new URL(request.url).searchParams;
    const rg = rangoGestion(anioGestionActiva(request));
    let q = ctx.supabase
      .from("libro_compras")
      .select(COMPRA_COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .gte("fecha", rg.desde)
      .lte("fecha", rg.hasta)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000);
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) q = q.gte("fecha", desde);
    if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) q = q.lte("fecha", hasta);
    const tipo = sp.get("tipo");
    if (esUuid(tipo)) q = q.eq("tipo_id", tipo);
    const estado = sp.get("estado");
    if (estado === "registrada" || estado === "anulada") q = q.eq("estado", estado);
    // Sección: Showroom / Producción / Comercio Exterior. Sin filtro = general (todas).
    const seccion = sp.get("seccion");
    if (esSeccion(seccion)) q = q.eq("seccion", seccion);
    // Para elegir qué comprobante corrige una nota de crédito: solo compras vigentes del proveedor.
    const proveedor = sp.get("proveedor");
    if (proveedor) q = q.eq("proveedor_nombre", proveedor).eq("estado", "registrada");
    const busca = textoBusqueda(sp.get("q"));
    if (busca) q = q.or(`proveedor_nombre.ilike.%${busca}%,nro_comprobante.ilike.%${busca}%,numero_control.ilike.%${busca}%,proveedor_ruc.ilike.%${busca}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ compras: data ?? [] }));
  } catch (err) {
    console.error("[/api/libro-compras GET]", err);
    return NextResponse.json(errorResponse("No se pudo cargar el libro de compras."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const anioLC = anioGestionActiva(request);
    if (await gestionCerrada(ctx.supabase as unknown as AppSupabaseClient, ctx.auth.empresa_id, anioLC)) {
      return NextResponse.json(errorResponse(`La gestión ${anioLC} está cerrada: no se pueden cargar compras.`), { status: 400 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const r = await guardarCompra(ctx.supabase, ctx.auth, body);
    // Contabilización automática (best-effort: si falla, la compra igual quedó guardada).
    try {
      const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
      await contabilizarCompra(schema, ctx.auth.empresa_id, r.id, ctx.auth.usuarioCatalogId ?? null);
    } catch (e) { console.error("[contabilizarCompra alta]", e instanceof Error ? e.message : e); }
    return NextResponse.json(successResponse(r));
  } catch (err) {
    if (err instanceof ErrorValidacion) return NextResponse.json(errorResponse(err.message), { status: 400 });
    console.error("[/api/libro-compras POST]", err);
    return NextResponse.json(errorResponse("No se pudo guardar el comprobante."), { status: 500 });
  }
}
