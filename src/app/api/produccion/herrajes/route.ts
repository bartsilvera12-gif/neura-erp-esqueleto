import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS = "id, codigo, descripcion, categoria, marca_modelo, especificacion, unidad, proveedor_id, stock_minimo, costo_referencia, activo, observaciones";

function datos(b: Record<string, unknown>): { ok: Record<string, unknown> } | { error: string } {
  const codigo = String(b.codigo ?? "").trim();
  if (!codigo) return { error: "El código es obligatorio." };
  const descripcion = String(b.descripcion ?? "").trim();
  if (!descripcion) return { error: "La descripción es obligatoria." };
  return {
    ok: {
      codigo,
      descripcion,
      categoria: String(b.categoria ?? "").trim() || null,
      marca_modelo: String(b.marca_modelo ?? "").trim() || null,
      especificacion: String(b.especificacion ?? "").trim() || null,
      unidad: String(b.unidad ?? "UNIDAD").trim().toUpperCase() || "UNIDAD",
      proveedor_id: b.proveedor_id ? String(b.proveedor_id) : null,
      stock_minimo: Number(b.stock_minimo) || 0,
      costo_referencia: Number(b.costo_referencia) || 0,
      activo: b.activo !== false,
      observaciones: String(b.observaciones ?? "").trim() || null,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const incluirInactivos = new URL(request.url).searchParams.get("incluir_inactivos") === "1";
    let q = ctx.supabase.from("prod_herrajes").select(COLS).eq("empresa_id", ctx.auth.empresa_id).order("codigo");
    if (!incluirInactivos) q = q.eq("activo", true);
    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ herrajes: data ?? [] }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const d = datos(b);
    if ("error" in d) return NextResponse.json(errorResponse(d.error), { status: 400 });
    const ins = await ctx.supabase.from("prod_herrajes").insert({ empresa_id: ctx.auth.empresa_id, ...d.ok }).select(COLS).single();
    if (ins.error) {
      const dup = (ins.error as { code?: string }).code === "23505";
      return NextResponse.json(errorResponse(dup ? "Ya existe un herraje con ese código." : ins.error.message), { status: 400 });
    }
    return NextResponse.json(successResponse({ herraje: ins.data }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
