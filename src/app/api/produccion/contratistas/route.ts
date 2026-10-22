import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS = "id, nombre, identificacion, contacto, telefono, especialidad, activo, observaciones";

function datos(b: Record<string, unknown>): { ok: Record<string, unknown> } | { error: string } {
  const nombre = String(b.nombre ?? "").trim();
  if (!nombre) return { error: "El nombre es obligatorio." };
  return {
    ok: {
      nombre,
      identificacion: String(b.identificacion ?? "").trim() || null,
      contacto: String(b.contacto ?? "").trim() || null,
      telefono: String(b.telefono ?? "").trim() || null,
      especialidad: String(b.especialidad ?? "").trim() || null,
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
    let q = ctx.supabase.from("prod_contratistas").select(COLS).eq("empresa_id", ctx.auth.empresa_id).order("nombre");
    if (!incluirInactivos) q = q.eq("activo", true);
    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ contratistas: data ?? [] }));
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
    const ins = await ctx.supabase.from("prod_contratistas").insert({ empresa_id: ctx.auth.empresa_id, ...d.ok }).select(COLS).single();
    if (ins.error) return NextResponse.json(errorResponse(ins.error.message), { status: 400 });
    return NextResponse.json(successResponse({ contratista: ins.data }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
