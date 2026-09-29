import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { getComexCtx } from "@/lib/comex/server";

/** PATCH { nombre?, condicion?, cuenta_codigo?, activo?, es_nota_credito? } — editar un tipo (solo admin). */
export async function PATCH(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede editar los tipos."), { status: 403 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.nombre !== undefined) {
      const n = String(b.nombre).trim().toUpperCase();
      if (!n) return NextResponse.json(errorResponse("El nombre no puede quedar vacío."), { status: 400 });
      upd.nombre = n.slice(0, 80);
    }
    if (b.condicion !== undefined) upd.condicion = b.condicion === "CREDITO" ? "CREDITO" : "CONTADO";
    if (b.cuenta_codigo !== undefined) upd.cuenta_codigo = String(b.cuenta_codigo ?? "").trim() || null;
    if (b.activo !== undefined) upd.activo = b.activo === true;
    if (b.es_nota_credito !== undefined) upd.es_nota_credito = b.es_nota_credito === true;
    const { error } = await ctx.supabase.from("compra_tipos_comprobante").update(upd).eq("empresa_id", ctx.auth.empresa_id).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/libro-compras/tipos/:id PATCH]", err);
    return NextResponse.json(errorResponse("No se pudo guardar el tipo."), { status: 500 });
  }
}
