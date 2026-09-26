import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { ORIGENES, nombreUsuario, origenDeEmpresa, registrarHistorial } from "@/lib/comex/server";
import type { OrigenComex } from "@/lib/comex/types";

const COLS =
  "id, origen_tipo, origen_id, tipo, descripcion, prioridad, estado, responsable_id, responsable_nombre, accion_correctiva, " +
  "resuelto_at, verificado_at, verificado_por_nombre, created_by_nombre, created_at, updated_at";

/** GET ?origen_tipo=&origen_id=&estado=abiertas|todas */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sp = new URL(request.url).searchParams;
    let q = ctx.supabase.from("comex_incidencias").select(COLS).eq("empresa_id", ctx.auth.empresa_id).order("created_at", { ascending: false }).limit(500);
    const ot = sp.get("origen_tipo");
    const oid = sp.get("origen_id");
    if (ot && ORIGENES.has(ot as OrigenComex)) q = q.eq("origen_tipo", ot);
    if (oid) q = q.eq("origen_id", oid);
    if (sp.get("estado") === "abiertas") q = q.not("estado", "in", "(resuelto,verificado)");
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ incidencias: data ?? [] }));
  } catch (err) {
    console.error("[/api/comex/incidencias GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar las incidencias."), { status: 500 });
  }
}

/** POST: incidencia cargada a mano (QA-03), vinculada a una operación. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const origenTipo = String(b.origen_tipo ?? "") as OrigenComex;
    const origenId = String(b.origen_id ?? "");
    if (!ORIGENES.has(origenTipo) || !origenId) return NextResponse.json(errorResponse("Falta la operación."), { status: 400 });
    if (!(await origenDeEmpresa(ctx.supabase, ctx.auth.empresa_id, origenTipo, origenId)))
      return NextResponse.json(errorResponse("Operación no encontrada."), { status: 404 });
    const descripcion = String(b.descripcion ?? "").trim();
    if (!descripcion) return NextResponse.json(errorResponse("Describí la incidencia."), { status: 400 });
    const prioridad = ["baja", "media", "alta"].includes(String(b.prioridad)) ? String(b.prioridad) : "media";
    const responsableNombre = b.responsable_nombre ? String(b.responsable_nombre).trim() : null;

    const { data, error } = await ctx.supabase
      .from("comex_incidencias")
      .insert({
        empresa_id: ctx.auth.empresa_id,
        origen_tipo: origenTipo,
        origen_id: origenId,
        tipo: b.tipo ? String(b.tipo).slice(0, 60) : "OTRO",
        descripcion: descripcion.slice(0, 2000),
        prioridad,
        estado: responsableNombre ? "asignado" : "detectado",
        responsable_id: b.responsable_id ? String(b.responsable_id) : null,
        responsable_nombre: responsableNombre,
        created_by_nombre: nombreUsuario(ctx.auth),
      })
      .select(COLS)
      .single();
    if (error) throw new Error(error.message);
    await registrarHistorial(ctx.supabase, ctx.auth, origenTipo, origenId, "CREAR_INCIDENCIA", { descripcion, prioridad, responsable: responsableNombre });
    return NextResponse.json(successResponse({ incidencia: data }));
  } catch (err) {
    console.error("[/api/comex/incidencias POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
