import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { getAuthUserForApiRoute } from "@/lib/auth/get-auth-user-for-api-route";
import { resolveUsuarioErpFromAuthUser } from "@/lib/auth/resolve-usuario-erp";
import { isBootstrapSuperAdminEmail } from "@/lib/auth/super-admin-bootstrap-email";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { resolveEffectiveModules } from "@/lib/modulos/resolve-effective-modules";

/**
 * Acceso a las APIs del módulo Reportes.
 *
 * Equivale al `requireContabilidadApiAccess` de la instancia de donde se portaron
 * estos reportes, pero gateado por el slug `reportes` (que es el módulo que existe
 * en esta instancia) en vez de `contabilidad`.
 *
 * Permitido para: super_admin, admin de empresa (o email bootstrap) o cualquier
 * usuario con el módulo `reportes` efectivo. 403 en el resto.
 */
export type ReportesApiAuth =
  | { ok: true; empresaId: string; usuarioCatalogId: string; usuarioEmail: string | null; rol: string | null }
  | { ok: false; status: number; message: string };

export async function requireReportesApiAccess(request: Request): Promise<ReportesApiAuth> {
  const user = await getAuthUserForApiRoute(request);
  if (!user?.id) {
    return { ok: false, status: 401, message: "No autenticado" };
  }

  const catalog = createServiceRoleClient();
  const usuario = await resolveUsuarioErpFromAuthUser(catalog, user);

  if (!usuario?.empresa_id) {
    return { ok: false, status: 403, message: "Usuario sin empresa" };
  }

  const rol = (usuario.rol ?? "").trim();
  const ok = {
    ok: true as const,
    empresaId: usuario.empresa_id,
    usuarioCatalogId: usuario.id,
    usuarioEmail: user.email ?? null,
    rol: usuario.rol,
  };

  if (rol === "super_admin" || isBootstrapSuperAdminEmail(user.email) || esRolAdminEmpresaOGlobal(rol)) {
    return ok;
  }

  const modulos = await resolveEffectiveModules(catalog, {
    id: usuario.id,
    empresa_id: usuario.empresa_id,
    rol: usuario.rol,
  });
  const slugs = new Set(modulos.map((m) => (m.slug ?? "").trim().toLowerCase()));
  if (slugs.has("reportes")) return ok;

  return { ok: false, status: 403, message: "Sin permiso de Reportes" };
}
