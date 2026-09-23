import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth, getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { validarConfigPunto } from "@/lib/facturas-exportacion/config-validar";

export const dynamic = "force-dynamic";

const COLS =
  "id, establecimiento, punto_expedicion, timbrado, vigencia_desde, vigencia_hasta, " +
  "rango_desde, rango_hasta, proximo_numero, proximo_numero_prueba, modo_prueba, activo, tipo, ruc, autoimpresor_nro";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("facturas_exportacion_config")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("punto_expedicion");
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ config: data ?? [] }));
  } catch (err) {
    console.error("[/api/facturas-exportacion/config GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar la configuración."), { status: 500 });
  }
}

/** PATCH { modo_prueba: boolean } — activa o desactiva el modo prueba en todos los puntos. Solo admin. */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    if (!esRolAdminEmpresaOGlobal(auth.rol))
      return NextResponse.json(errorResponse("Solo un administrador puede cambiar el modo de facturación."), { status: 403 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof body.modo_prueba !== "boolean")
      return NextResponse.json(errorResponse("Falta modo_prueba."), { status: 400 });

    const { error } = await supabase
      .from("facturas_exportacion_config")
      .update({ modo_prueba: body.modo_prueba, updated_at: new Date().toISOString() })
      .eq("empresa_id", auth.empresa_id);
    if (error) throw new Error(error.message);

    await supabase.from("facturas_exportacion_auditoria").insert({
      empresa_id: auth.empresa_id,
      accion: body.modo_prueba ? "ACTIVAR_MODO_PRUEBA" : "PASAR_A_PRODUCCION",
      detalle: { modo_prueba: body.modo_prueba },
      usuario_id: auth.user.id,
      usuario_nombre: auth.nombre ?? auth.user.email ?? null,
    });
    return NextResponse.json(successResponse({ modo_prueba: body.modo_prueba }));
  } catch (err) {
    console.error("[/api/facturas-exportacion/config PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cambiar el modo."), { status: 500 });
  }
}

/** POST — agrega un punto de expedición / timbrado nuevo (ej. cuando renuevan el timbrado). Solo admin. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    if (!esRolAdminEmpresaOGlobal(auth.rol))
      return NextResponse.json(errorResponse("Solo un administrador puede configurar el timbrado."), { status: 403 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nuevo = {
      timbrado: String(b.timbrado ?? "").trim(),
      establecimiento: String(b.establecimiento ?? "").trim(),
      punto_expedicion: String(b.punto_expedicion ?? "").trim(),
      vigencia_desde: String(b.vigencia_desde ?? "").slice(0, 10),
      vigencia_hasta: String(b.vigencia_hasta ?? "").slice(0, 10),
      rango_desde: Math.floor(Number(b.rango_desde) || 1),
      rango_hasta: Math.floor(Number(b.rango_hasta) || 0),
      proximo_numero: Math.floor(Number(b.proximo_numero) || 1),
    };
    const err = validarConfigPunto(nuevo);
    if (err) return NextResponse.json(errorResponse(err), { status: 400 });

    const ins = await supabase
      .from("facturas_exportacion_config")
      .insert({
        ...nuevo,
        empresa_id: auth.empresa_id,
        activo: true,
        modo_prueba: true,
        tipo: "EXPORTACION",
        ruc: String(b.ruc ?? "80150840-1").trim(),
        autoimpresor_nro: String(b.autoimpresor_nro ?? "").trim() || null,
      })
      .select(COLS)
      .single();
    if (ins.error) {
      if (/duplicate|unique|23505/i.test(ins.error.message))
        return NextResponse.json(errorResponse("Ese punto ya está cargado con ese timbrado."), { status: 409 });
      throw new Error(ins.error.message);
    }
    // Un solo timbrado activo por punto: el nuevo reemplaza al anterior.
    await supabase
      .from("facturas_exportacion_config")
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq("empresa_id", auth.empresa_id)
      .eq("establecimiento", nuevo.establecimiento)
      .eq("punto_expedicion", nuevo.punto_expedicion)
      .neq("id", (ins.data as unknown as { id: string }).id);

    await supabase.from("facturas_exportacion_auditoria").insert({
      empresa_id: auth.empresa_id,
      accion: "CONFIG_CREAR",
      detalle: { despues: nuevo },
      usuario_id: auth.user.id,
      usuario_nombre: auth.nombre ?? auth.user.email ?? null,
    });
    return NextResponse.json(successResponse({ config: ins.data }));
  } catch (err) {
    console.error("[/api/facturas-exportacion/config POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo guardar el punto."), { status: 500 });
  }
}
