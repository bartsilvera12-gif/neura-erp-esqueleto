import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS =
  "id, codigo, tipo, espesor_valor, espesor_unidad, color_acabado, largo, ancho, dimension_unidad, marca, proveedor_id, unidad_compra, costo_referencia, activo, observaciones";

/** Normaliza el cuerpo del tablero. */
function datos(b: Record<string, unknown>): { ok: Record<string, unknown> } | { error: string } {
  const codigo = String(b.codigo ?? "").trim();
  if (!codigo) return { error: "El código es obligatorio." };
  const tipo = String(b.tipo ?? "MDF").trim().toUpperCase() || "MDF";
  const numOrNull = (v: unknown) => (v === "" || v == null ? null : Number(v));
  return {
    ok: {
      codigo,
      tipo,
      espesor_valor: numOrNull(b.espesor_valor),
      espesor_unidad: String(b.espesor_unidad ?? "mm").trim() || "mm",
      color_acabado: String(b.color_acabado ?? "").trim() || null,
      largo: numOrNull(b.largo),
      ancho: numOrNull(b.ancho),
      dimension_unidad: String(b.dimension_unidad ?? "mm").trim() || "mm",
      marca: String(b.marca ?? "").trim() || null,
      proveedor_id: b.proveedor_id ? String(b.proveedor_id) : null,
      unidad_compra: String(b.unidad_compra ?? "PLANCHA").trim().toUpperCase() || "PLANCHA",
      costo_referencia: Number(b.costo_referencia) || 0,
      activo: b.activo !== false,
      observaciones: String(b.observaciones ?? "").trim() || null,
    },
  };
}

/** GET /api/produccion/tableros — catálogo de tableros. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { searchParams } = new URL(request.url);
    const incluirInactivos = searchParams.get("incluir_inactivos") === "1";
    let q = ctx.supabase.from("prod_tableros").select(COLS).eq("empresa_id", ctx.auth.empresa_id).order("codigo");
    if (!incluirInactivos) q = q.eq("activo", true);
    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ tableros: data ?? [] }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** POST /api/produccion/tableros — crea un tablero. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const d = datos(b);
    if ("error" in d) return NextResponse.json(errorResponse(d.error), { status: 400 });
    const ins = await ctx.supabase.from("prod_tableros").insert({ empresa_id: ctx.auth.empresa_id, ...d.ok }).select(COLS).single();
    if (ins.error) {
      const dup = (ins.error as { code?: string }).code === "23505";
      return NextResponse.json(errorResponse(dup ? "Ya existe un tablero con ese código." : ins.error.message), { status: 400 });
    }
    return NextResponse.json(successResponse({ tablero: ins.data }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
