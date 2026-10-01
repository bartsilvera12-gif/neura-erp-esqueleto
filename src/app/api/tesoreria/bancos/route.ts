import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { getComexCtx } from "@/lib/comex/server";
import { datosCuentaBanco } from "@/lib/tesoreria/validar";

/** POST — nueva cuenta bancaria (solo admin). */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede crear cuentas."), { status: 403 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const d = datosCuentaBanco(b, true);
    if ("error" in d) return NextResponse.json(errorResponse(d.error), { status: 400 });
    const { data, error } = await ctx.supabase
      .from("entidades_bancarias")
      .insert({ ...d.datos, empresa_id: ctx.auth.empresa_id, tipo: "banco", activo: true, orden: 0 })
      .select("id")
      .single();
    if (error) {
      if (/duplicate|unique|23505/i.test(error.message))
        return NextResponse.json(errorResponse("Ya existe una cuenta con ese nombre. Poné otro."), { status: 409 });
      return NextResponse.json(errorResponse(`No se pudo crear la cuenta: ${error.message}`), { status: 400 });
    }
    return NextResponse.json(successResponse({ id: (data as { id: string }).id }));
  } catch (err) {
    console.error("[/api/tesoreria/bancos POST]", err);
    return NextResponse.json(errorResponse("No se pudo crear la cuenta."), { status: 500 });
  }
}
