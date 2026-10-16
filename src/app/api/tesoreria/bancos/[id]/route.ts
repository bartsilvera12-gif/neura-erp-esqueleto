import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { getComexCtx } from "@/lib/comex/server";
import { datosCuentaBanco } from "@/lib/tesoreria/validar";

/** PATCH — editar cuenta bancaria (solo admin). */
export async function PATCH(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede editar cuentas."), { status: 403 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const d = datosCuentaBanco(b, false);
    if ("error" in d) return NextResponse.json(errorResponse(d.error), { status: 400 });
    // Con movimientos, la moneda ya no se cambia.
    if (d.datos.moneda) {
      const { data: prev } = await ctx.supabase.from("entidades_bancarias").select("moneda").eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle();
      const { count } = await ctx.supabase.from("banco_movimientos").select("id", { count: "exact", head: true }).eq("empresa_id", ctx.auth.empresa_id).eq("entidad_bancaria_id", id);
      if ((count ?? 0) > 0 && (prev as { moneda?: string } | null)?.moneda !== d.datos.moneda)
        return NextResponse.json(errorResponse("La cuenta ya tiene movimientos: no se puede cambiar la moneda."), { status: 400 });
    }
    const { error } = await ctx.supabase.from("entidades_bancarias").update(d.datos).eq("empresa_id", ctx.auth.empresa_id).eq("id", id).eq("tipo", "banco");
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/tesoreria/bancos/:id PATCH]", err);
    return NextResponse.json(errorResponse("No se pudo guardar la cuenta."), { status: 500 });
  }
}

/** DELETE — eliminar cuenta bancaria y sus movimientos (solo admin). */
export async function DELETE(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede eliminar cuentas."), { status: 403 });
    const emp = ctx.auth.empresa_id;
    // banco_movimientos tiene FK ON DELETE RESTRICT: hay que borrarlos primero.
    const delMov = await ctx.supabase.from("banco_movimientos").delete().eq("empresa_id", emp).eq("entidad_bancaria_id", id);
    if (delMov.error) throw new Error(delMov.error.message);
    const { error } = await ctx.supabase.from("entidades_bancarias").delete().eq("empresa_id", emp).eq("id", id).eq("tipo", "banco");
    if (error) {
      if (/foreign key|violates|23503/i.test(error.message))
        return NextResponse.json(errorResponse("No se puede eliminar: la cuenta está vinculada a otros registros."), { status: 409 });
      throw new Error(error.message);
    }
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/tesoreria/bancos/:id DELETE]", err);
    return NextResponse.json(errorResponse("No se pudo eliminar la cuenta."), { status: 500 });
  }
}
