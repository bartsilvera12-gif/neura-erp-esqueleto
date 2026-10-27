import { NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { getAuthUserForApiRoute } from "@/lib/auth/get-auth-user-for-api-route";
import { resolveUsuarioErpFromAuthUser } from "@/lib/auth/resolve-usuario-erp";
import { listPlanCuentas } from "@/lib/plan-cuentas/plan-cuentas";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const runtime = "nodejs";

/**
 * Lista SOLO-LECTURA del plan de cuentas para los desplegables (ej: cuenta
 * contable al cargar un gasto). A diferencia de /api/configuracion/plan-cuentas
 * (admin-only, edición), este endpoint lo puede usar cualquier usuario de la
 * empresa, porque es solo para elegir una cuenta, no para administrarla.
 */
export async function GET(request: Request) {
  try {
    const user = await getAuthUserForApiRoute(request);
    if (!user?.id) return NextResponse.json(errorResponse("No autenticado"), { status: 401 });

    const catalog = createServiceRoleClient();
    const usuario = await resolveUsuarioErpFromAuthUser(catalog, user);
    if (!usuario?.empresa_id) return NextResponse.json(errorResponse("Usuario sin empresa"), { status: 403 });

    const cuentas = await listPlanCuentas(catalog as unknown as AppSupabaseClient, usuario.empresa_id);
    return NextResponse.json(successResponse({ cuentas }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "No se pudo cargar el Plan de Cuentas";
    return NextResponse.json(errorResponse(message), { status: 500 });
  }
}
