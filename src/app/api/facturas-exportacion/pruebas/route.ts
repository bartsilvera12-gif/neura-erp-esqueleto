import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";

export const dynamic = "force-dynamic";

/** DELETE — borra las facturas de PRUEBA y reinicia su numeración. Nunca toca facturas reales. */
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    if (!esRolAdminEmpresaOGlobal(auth.rol))
      return NextResponse.json(errorResponse("Solo un administrador puede borrar facturas de prueba."), { status: 403 });

    const del = await supabase
      .from("facturas_exportacion")
      .delete()
      .eq("empresa_id", auth.empresa_id)
      .eq("prueba", true)
      .select("id");
    if (del.error) throw new Error(del.error.message);
    const borradas = (del.data ?? []).length;

    await supabase
      .from("facturas_exportacion_config")
      .update({ proximo_numero_prueba: 1, updated_at: new Date().toISOString() })
      .eq("empresa_id", auth.empresa_id);

    await supabase.from("facturas_exportacion_auditoria").insert({
      empresa_id: auth.empresa_id,
      accion: "BORRAR_PRUEBAS",
      detalle: { borradas },
      usuario_id: auth.user.id,
      usuario_nombre: auth.nombre ?? auth.user.email ?? null,
    });
    return NextResponse.json(successResponse({ borradas }));
  } catch (err) {
    console.error("[/api/facturas-exportacion/pruebas DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron borrar las facturas de prueba."), { status: 500 });
  }
}
