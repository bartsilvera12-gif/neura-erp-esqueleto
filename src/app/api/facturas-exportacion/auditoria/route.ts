import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";

export const dynamic = "force-dynamic";

/** GET ?desde&hasta&accion&factura_id — historial de acciones del módulo. Solo admin. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    if (!esRolAdminEmpresaOGlobal(auth.rol))
      return NextResponse.json(errorResponse("Solo un administrador puede ver el historial."), { status: 403 });

    const sp = new URL(request.url).searchParams;
    let q = supabase
      .from("facturas_exportacion_auditoria")
      .select("id, factura_id, accion, detalle, usuario_nombre, created_at")
      .eq("empresa_id", auth.empresa_id)
      .order("created_at", { ascending: false })
      .limit(500);
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const accion = sp.get("accion");
    const facturaId = sp.get("factura_id");
    if (desde) q = q.gte("created_at", `${desde}T00:00:00`);
    if (hasta) q = q.lte("created_at", `${hasta}T23:59:59.999`);
    if (accion) q = q.eq("accion", accion);
    if (facturaId) q = q.eq("factura_id", facturaId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const filas = (data ?? []) as unknown as Array<{ factura_id: string | null } & Record<string, unknown>>;
    const ids = [...new Set(filas.map((f) => f.factura_id).filter(Boolean))] as string[];
    const nums = new Map<string, { numero: string | null; prueba: boolean }>();
    if (ids.length) {
      const fx = await supabase
        .from("facturas_exportacion")
        .select("id, numero_formateado, prueba")
        .eq("empresa_id", auth.empresa_id)
        .in("id", ids);
      for (const r of (fx.data ?? []) as unknown as Array<{ id: string; numero_formateado: string | null; prueba: boolean }>)
        nums.set(r.id, { numero: r.numero_formateado, prueba: r.prueba });
    }
    return NextResponse.json(
      successResponse({
        auditoria: filas.map((f) => ({
          ...f,
          factura_numero: f.factura_id ? nums.get(f.factura_id)?.numero ?? null : null,
          factura_prueba: f.factura_id ? nums.get(f.factura_id)?.prueba ?? null : null,
        })),
      })
    );
  } catch (err) {
    console.error("[/api/facturas-exportacion/auditoria GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el historial."), { status: 500 });
  }
}
