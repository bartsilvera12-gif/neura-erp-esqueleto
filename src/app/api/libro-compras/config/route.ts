import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { getComexCtx } from "@/lib/comex/server";

const COLS = "cuenta_iva_credito, cuenta_proveedores, cuenta_retencion_iva, cuenta_retencion_renta, centro_costo_defecto, programa_defecto";

/** GET: tipos de comprobante de compra + cuentas del pre-asiento. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const [tipos, cfg] = await Promise.all([
      ctx.supabase.from("compra_tipos_comprobante").select("id, codigo, nombre, uso, condicion, es_nota_credito, cuenta_codigo, activo").eq("empresa_id", emp).order("codigo"),
      ctx.supabase.from("libro_compras_config").select(COLS).eq("empresa_id", emp).maybeSingle(),
    ]);
    const err = tipos.error ?? cfg.error;
    if (err) throw new Error(err.message);
    return NextResponse.json(
      successResponse({
        tipos: tipos.data ?? [],
        config: cfg.data ?? { cuenta_iva_credito: "2.01.03.01.002", cuenta_proveedores: "2.01.01.04.000", cuenta_retencion_iva: null, cuenta_retencion_renta: null, centro_costo_defecto: "1.00.00", programa_defecto: "1.00" },
      })
    );
  } catch (err) {
    console.error("[/api/libro-compras/config GET]", err);
    return NextResponse.json(errorResponse("No se pudo cargar la configuración."), { status: 500 });
  }
}

/** PATCH: cuentas del pre-asiento (solo admin). */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) return NextResponse.json(errorResponse("Solo un administrador puede cambiar las cuentas."), { status: 403 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const upd: Record<string, unknown> = { empresa_id: ctx.auth.empresa_id, updated_at: new Date().toISOString() };
    for (const k of COLS.split(", ")) if (b[k] !== undefined) upd[k] = String(b[k] ?? "").trim() || null;
    for (const k of ["cuenta_iva_credito", "cuenta_proveedores", "centro_costo_defecto", "programa_defecto"])
      if (k in upd && !upd[k]) return NextResponse.json(errorResponse("La cuenta de IVA, la de proveedores y los valores por defecto no pueden quedar vacíos."), { status: 400 });
    const { error } = await ctx.supabase.from("libro_compras_config").upsert(upd, { onConflict: "empresa_id" });
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    console.error("[/api/libro-compras/config PATCH]", err);
    return NextResponse.json(errorResponse("No se pudo guardar la configuración."), { status: 500 });
  }
}
