import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { validarConfigPunto } from "@/lib/facturas-exportacion/config-validar";

export const dynamic = "force-dynamic";

const CAMPOS = [
  "timbrado", "vigencia_desde", "vigencia_hasta", "rango_desde", "rango_hasta",
  "proximo_numero", "activo", "ruc", "autoimpresor_nro",
] as const;

/** PATCH — edita un punto. Solo admin. No deja bajar el próximo número por debajo de lo ya emitido. */
export async function PATCH(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    if (!esRolAdminEmpresaOGlobal(auth.rol))
      return NextResponse.json(errorResponse("Solo un administrador puede configurar el timbrado."), { status: 403 });

    const actual = await supabase
      .from("facturas_exportacion_config")
      .select("*")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (actual.error) throw new Error(actual.error.message);
    const antes = actual.data as unknown as Record<string, unknown> | null;
    if (!antes) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const k of CAMPOS) {
      if (b[k] === undefined) continue;
      if (k === "activo") patch[k] = b[k] === true;
      else if (k === "rango_desde" || k === "rango_hasta" || k === "proximo_numero") patch[k] = Math.floor(Number(b[k]));
      else if (k === "vigencia_desde" || k === "vigencia_hasta") patch[k] = String(b[k]).slice(0, 10);
      else patch[k] = String(b[k] ?? "").trim() || null;
    }
    const final = { ...antes, ...patch } as Record<string, unknown>;
    const err = validarConfigPunto({
      timbrado: String(final.timbrado ?? ""),
      establecimiento: String(final.establecimiento ?? ""),
      punto_expedicion: String(final.punto_expedicion ?? ""),
      vigencia_desde: String(final.vigencia_desde ?? ""),
      vigencia_hasta: String(final.vigencia_hasta ?? ""),
      rango_desde: Number(final.rango_desde),
      rango_hasta: Number(final.rango_hasta),
      proximo_numero: Number(final.proximo_numero),
    });
    if (err) return NextResponse.json(errorResponse(err), { status: 400 });

    // Nunca volver a un número ya usado por una factura real (evita duplicados).
    if (patch.proximo_numero !== undefined) {
      const ult = await supabase
        .from("facturas_exportacion")
        .select("numero")
        .eq("empresa_id", auth.empresa_id)
        .eq("establecimiento", String(final.establecimiento))
        .eq("punto_expedicion", String(final.punto_expedicion))
        .eq("timbrado", String(final.timbrado))
        .eq("prueba", false)
        .not("numero", "is", null)
        .order("numero", { ascending: false })
        .limit(1);
      const maxUsado = Number((ult.data?.[0] as { numero?: number } | undefined)?.numero ?? 0);
      if (Number(patch.proximo_numero) <= maxUsado)
        return NextResponse.json(
          errorResponse(`Ya se emitió hasta el número ${maxUsado}: el próximo tiene que ser ${maxUsado + 1} o más.`),
          { status: 400 }
        );
    }

    patch.updated_at = new Date().toISOString();
    const upd = await supabase.from("facturas_exportacion_config").update(patch).eq("empresa_id", auth.empresa_id).eq("id", id);
    if (upd.error) {
      if (/duplicate|unique|23505/i.test(upd.error.message))
        return NextResponse.json(errorResponse("Ya existe ese punto con ese timbrado."), { status: 409 });
      throw new Error(upd.error.message);
    }

    // Un solo timbrado activo por punto.
    if (patch.activo === true) {
      await supabase
        .from("facturas_exportacion_config")
        .update({ activo: false, updated_at: new Date().toISOString() })
        .eq("empresa_id", auth.empresa_id)
        .eq("establecimiento", String(final.establecimiento))
        .eq("punto_expedicion", String(final.punto_expedicion))
        .neq("id", id);
    }

    const cambiados = Object.keys(patch).filter((k) => k !== "updated_at" && String(antes[k] ?? "") !== String(patch[k] ?? ""));
    if (cambiados.length) {
      await supabase.from("facturas_exportacion_auditoria").insert({
        empresa_id: auth.empresa_id,
        accion: "CONFIG_MODIFICAR",
        detalle: {
          punto: `${antes.establecimiento}-${antes.punto_expedicion}`,
          antes: Object.fromEntries(cambiados.map((k) => [k, antes[k] ?? null])),
          despues: Object.fromEntries(cambiados.map((k) => [k, patch[k] ?? null])),
        },
        usuario_id: auth.user.id,
        usuario_nombre: auth.nombre ?? auth.user.email ?? null,
      });
    }
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/facturas-exportacion/config/[id] PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo guardar la configuración."), { status: 500 });
  }
}
