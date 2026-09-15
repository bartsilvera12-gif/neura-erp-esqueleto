import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/proyectos/fondos
 * Devuelve el listado de proyectos con el total de gastos imputados a cada uno.
 * Cubre PDF §2 "fondos por proyecto".
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;

    const [proyQ, gastosQ] = await Promise.all([
      ctx.supabase
        .from("proyectos")
        .select("id, titulo, estado_id, prioridad, monto_vendido, created_at")
        .eq("empresa_id", empresaId)
        .eq("archivado", false)
        .order("created_at", { ascending: false })
        .limit(500),
      ctx.supabase
        .from("gastos")
        .select("proyecto_id, monto")
        .eq("empresa_id", empresaId)
        .not("proyecto_id", "is", null),
    ]);
    if (proyQ.error) throw new Error(proyQ.error.message);
    if (gastosQ.error) throw new Error(gastosQ.error.message);

    const totales = new Map<string, number>();
    for (const g of (gastosQ.data ?? []) as Array<{ proyecto_id: string; monto: number | string }>) {
      const pid = g.proyecto_id;
      totales.set(pid, (totales.get(pid) ?? 0) + Number(g.monto ?? 0));
    }

    const proyectos = ((proyQ.data ?? []) as Array<Record<string, unknown>>).map((p) => {
      const id = String(p.id);
      const totalGastado = totales.get(id) ?? 0;
      const montoVendido = Number(p.monto_vendido ?? 0);
      return {
        id,
        titulo: String(p.titulo ?? "(sin título)"),
        estado_id: (p.estado_id as string | null) ?? null,
        prioridad: (p.prioridad as string) ?? "normal",
        monto_vendido: montoVendido,
        total_gastado: totalGastado,
        saldo: montoVendido - totalGastado,
      };
    });

    return NextResponse.json(successResponse({ proyectos }));
  } catch (err) {
    console.error("[/api/proyectos/fondos GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los fondos."), { status: 500 });
  }
}
