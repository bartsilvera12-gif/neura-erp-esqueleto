import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { getComexCtx } from "@/lib/comex/server";
import { datosCajaChica } from "@/lib/tesoreria/validar";

/** PATCH — editar caja chica (solo admin). */
export async function PATCH(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede editar cajas chicas."), { status: 403 });
    const d = datosCajaChica((await request.json().catch(() => ({}))) as Record<string, unknown>, false);
    if ("error" in d) return NextResponse.json(errorResponse(d.error), { status: 400 });
    if (d.datos.moneda) {
      const { count } = await ctx.supabase.from("caja_chica_movimientos").select("id", { count: "exact", head: true }).eq("empresa_id", ctx.auth.empresa_id).eq("caja_chica_id", id);
      const { data: prev } = await ctx.supabase.from("cajas_chicas").select("moneda").eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle();
      if ((count ?? 0) > 0 && (prev as { moneda?: string } | null)?.moneda !== d.datos.moneda)
        return NextResponse.json(errorResponse("La caja ya tiene movimientos: no se puede cambiar la moneda."), { status: 400 });
    }
    const { error } = await ctx.supabase.from("cajas_chicas").update({ ...d.datos, updated_at: new Date().toISOString() }).eq("empresa_id", ctx.auth.empresa_id).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/tesoreria/cajas/:id PATCH]", err);
    return NextResponse.json(errorResponse("No se pudo guardar la caja chica."), { status: 500 });
  }
}
