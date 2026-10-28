import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { anioGestionActiva } from "@/lib/gestion/gestion-activa";

/** GET — gestiones (años) de la empresa + la gestión activa (de la cookie). */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("gestiones")
      .select("anio, estado")
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("anio", { ascending: false });
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({
      gestiones: data ?? [],
      activa: anioGestionActiva(request),
      puede_cerrar: esRolAdminEmpresaOGlobal(ctx.auth.rol),
    }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** POST — abre/cierra una gestión (solo admin). Body: { anio, estado: 'abierta'|'cerrada' }. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) {
      return NextResponse.json(errorResponse("Solo un administrador puede abrir o cerrar una gestión."), { status: 403 });
    }
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const anio = Number(b.anio) || 0;
    if (anio < 2000 || anio > 2100) return NextResponse.json(errorResponse("Año inválido."), { status: 400 });
    const estado = b.estado === "cerrada" ? "cerrada" : "abierta";

    const ex = await ctx.supabase.from("gestiones").select("id").eq("empresa_id", emp).eq("anio", anio).maybeSingle();
    const patch = {
      estado,
      cerrada_por: estado === "cerrada" ? (ctx.auth.user?.email ?? null) : null,
      cerrada_at: estado === "cerrada" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    if (ex.data) {
      const upd = await ctx.supabase.from("gestiones").update(patch).eq("empresa_id", emp).eq("anio", anio);
      if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
    } else {
      const ins = await ctx.supabase.from("gestiones").insert({ empresa_id: emp, anio, ...patch });
      if (ins.error) return NextResponse.json(errorResponse(ins.error.message), { status: 400 });
    }
    return NextResponse.json(successResponse({ anio, estado }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
