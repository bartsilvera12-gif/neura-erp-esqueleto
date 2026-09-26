import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { nombreUsuario, registrarHistorial } from "@/lib/comex/server";
import { CHECKLIST_DESPACHO, CHECKLIST_KEYS } from "@/lib/exportaciones/checklist";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("exportacion_checklist")
      .select("item, ok, observacion, usuario_nombre, updated_at")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("exportacion_id", id);
    if (error) throw new Error(error.message);
    const porItem = new Map(((data ?? []) as { item: string }[]).map((r) => [r.item, r]));
    const checklist = CHECKLIST_DESPACHO.map((c) => porItem.get(c.key) ?? { item: c.key, ok: false, observacion: null, usuario_nombre: null, updated_at: null });
    return NextResponse.json(successResponse({ checklist }));
  } catch (err) {
    console.error("[/api/exportaciones/:id/checklist GET]", err);
    return NextResponse.json(errorResponse("No se pudo cargar el checklist."), { status: 500 });
  }
}

/**
 * POST { item, ok, observacion } — marca un control (QA-02: usuario, fecha/hora,
 * resultado y observación). Solo antes de aprobar el despacho.
 */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as { item?: string; ok?: boolean; observacion?: string };
    const item = String(b.item ?? "");
    if (!CHECKLIST_KEYS.has(item)) return NextResponse.json(errorResponse("Control inválido."), { status: 400 });
    const { data } = await ctx.supabase.from("exportaciones").select("estado, responsable_id").eq("empresa_id", emp).eq("id", id).maybeSingle();
    const exp = data as { estado: string; responsable_id: string | null } | null;
    if (!exp) return NextResponse.json(errorResponse("Exportación no encontrada."), { status: 404 });
    if (exp.estado !== "preparacion" && exp.estado !== "documentacion")
      return NextResponse.json(errorResponse("El checklist se completa antes de aprobar el despacho. Para cambiarlo, volvé a Documentación."), { status: 400 });
    if (item === "aprobacion_responsable" && !esRolAdminEmpresaOGlobal(ctx.auth.rol) && exp.responsable_id !== (ctx.auth.usuarioCatalogId ?? null))
      return NextResponse.json(errorResponse("Esta aprobación la marca el responsable del envío o un administrador."), { status: 403 });

    const ok = b.ok === true;
    const observacion = b.observacion ? String(b.observacion).trim().slice(0, 1000) : null;
    const { error } = await ctx.supabase.from("exportacion_checklist").upsert(
      {
        empresa_id: emp,
        exportacion_id: id,
        item,
        ok,
        observacion,
        usuario_id: ctx.auth.usuarioCatalogId ?? null,
        usuario_nombre: nombreUsuario(ctx.auth),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "exportacion_id,item" }
    );
    if (error) throw new Error(error.message);
    const label = CHECKLIST_DESPACHO.find((c) => c.key === item)?.label ?? item;
    await registrarHistorial(ctx.supabase, ctx.auth, "EXPORTACION", id, ok ? "CHECKLIST_OK" : "CHECKLIST_PENDIENTE", {
      control: label,
      ...(observacion ? { observacion } : {}),
    });
    return NextResponse.json(successResponse({ item, ok }));
  } catch (err) {
    console.error("[/api/exportaciones/:id/checklist POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
