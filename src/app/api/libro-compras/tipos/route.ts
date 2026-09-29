import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { getComexCtx } from "@/lib/comex/server";

/** POST { codigo, nombre, condicion, cuenta_codigo, es_nota_credito } — nuevo tipo de comprobante de compra (solo admin). */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede crear tipos."), { status: 403 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const codigo = Number(b.codigo);
    const nombre = String(b.nombre ?? "").trim().toUpperCase();
    if (!(Number.isInteger(codigo) && codigo > 0)) return NextResponse.json(errorResponse("El código tiene que ser un número entero."), { status: 400 });
    if (!nombre) return NextResponse.json(errorResponse("Falta el nombre."), { status: 400 });
    const { error } = await ctx.supabase.from("compra_tipos_comprobante").insert({
      empresa_id: ctx.auth.empresa_id,
      codigo,
      nombre: nombre.slice(0, 80),
      uso: "COMPRA",
      condicion: b.condicion === "CREDITO" ? "CREDITO" : "CONTADO",
      es_nota_credito: b.es_nota_credito === true,
      cuenta_codigo: String(b.cuenta_codigo ?? "").trim() || null,
    });
    if (error) {
      if (error.code === "23505") return NextResponse.json(errorResponse(`Ya existe un tipo con el código ${codigo}.`), { status: 400 });
      throw new Error(error.message);
    }
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    console.error("[/api/libro-compras/tipos POST]", err);
    return NextResponse.json(errorResponse("No se pudo crear el tipo."), { status: 500 });
  }
}
