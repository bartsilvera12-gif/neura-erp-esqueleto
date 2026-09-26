import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, registrarHistorial } from "@/lib/comex/server";

const CONTENEDOR_COLS =
  "id, numero, tipo_operacion, importacion_id, exportacion_id, estado, naviera, fecha_prevista, fecha_real, observaciones, created_at, updated_at";

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("comex_contenedores")
      .select(CONTENEDOR_COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("importacion_id", id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ contenedores: data ?? [] }));
  } catch (err) {
    console.error("[/api/importaciones/:id/contenedores GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar los contenedores."), { status: 500 });
  }
}

export async function POST(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const { data: imp } = await ctx.supabase.from("importaciones").select("estado, numero").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (!imp) return NextResponse.json(errorResponse("Importación no encontrada."), { status: 404 });
    const estado = (imp as { estado: string }).estado;
    if (estado === "anulada" || estado === "cerrada")
      return NextResponse.json(errorResponse("La importación está cerrada o anulada."), { status: 400 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const numero = String(b.numero ?? "").trim().toUpperCase();
    if (!numero) return NextResponse.json(errorResponse("Escribí el número del contenedor."), { status: 400 });

    // El mismo contenedor no puede estar dos veces en la misma importación.
    const { data: dup } = await ctx.supabase
      .from("comex_contenedores")
      .select("id")
      .eq("empresa_id", emp)
      .eq("importacion_id", id)
      .eq("numero", numero)
      .maybeSingle();
    if (dup) return NextResponse.json(errorResponse(`El contenedor ${numero} ya está en esta importación.`), { status: 400 });

    const { data, error } = await ctx.supabase
      .from("comex_contenedores")
      .insert({
        empresa_id: emp,
        numero: numero.slice(0, 40),
        tipo_operacion: "IMPORTACION",
        importacion_id: id,
        naviera: b.naviera ? String(b.naviera).trim().slice(0, 120) : null,
        fecha_prevista: b.fecha_prevista || null,
        fecha_real: b.fecha_real || null,
        observaciones: b.observaciones ? String(b.observaciones).slice(0, 1000) : null,
      })
      .select(CONTENEDOR_COLS)
      .single();
    if (error) throw new Error(error.message);
    const cont = data as unknown as { id: string };
    await registrarHistorial(ctx.supabase, ctx.auth, "IMPORTACION", id, "AGREGAR_CONTENEDOR", { contenedor: numero });
    await registrarHistorial(ctx.supabase, ctx.auth, "CONTENEDOR", cont.id, "CREAR", {
      numero,
      importacion: (imp as { numero: string }).numero,
    });
    return NextResponse.json(successResponse({ contenedor: data }));
  } catch (err) {
    console.error("[/api/importaciones/:id/contenedores POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
