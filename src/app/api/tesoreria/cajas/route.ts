import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { getComexCtx } from "@/lib/comex/server";
import { datosCajaChica } from "@/lib/tesoreria/validar";

/** POST — nueva caja chica (solo admin). Arranca en 0: se carga con una reposición desde el banco. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede crear cajas chicas."), { status: 403 });
    const d = datosCajaChica((await request.json().catch(() => ({}))) as Record<string, unknown>, true);
    if ("error" in d) return NextResponse.json(errorResponse(d.error), { status: 400 });
    const { data, error } = await ctx.supabase.from("cajas_chicas").insert({ ...d.datos, empresa_id: ctx.auth.empresa_id, activa: true }).select("id").single();
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id: (data as { id: string }).id }));
  } catch (err) {
    console.error("[/api/tesoreria/cajas POST]", err);
    return NextResponse.json(errorResponse("No se pudo crear la caja chica."), { status: 500 });
  }
}
