import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { getAuthUserForApiRoute } from "@/lib/auth/get-auth-user-for-api-route";
import { resolveUsuarioErpFromAuthUser } from "@/lib/auth/resolve-usuario-erp";
import { isBootstrapSuperAdminEmail } from "@/lib/auth/super-admin-bootstrap-email";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { resolveEffectiveModules } from "@/lib/modulos/resolve-effective-modules";

/**
 * Acceso a la API de Plan de Cuentas (catálogo contable).
 * Permitido para: admin/super_admin de la empresa (o email bootstrap), o cualquier
 * usuario con el módulo `contabilidad` (el Plan de Cuentas es una sub-sección de
 * Contabilidad, no una configuración global). Devuelve la empresa e info de permiso.
 */
export type PlanCuentasApiAuth =
  | { ok: true; empresaId: string; usuarioCatalogId: string; usuarioEmail: string | null; rol: string | null; canEdit: boolean }
  | { ok: false; status: number; message: string };

export async function requirePlanCuentasApiAccess(request: Request): Promise<PlanCuentasApiAuth> {
  const user = await getAuthUserForApiRoute(request);
  if (!user?.id) {
    return { ok: false, status: 401, message: "No autenticado" };
  }

  const catalog = createServiceRoleClient();
  const usuario = await resolveUsuarioErpFromAuthUser(catalog, user);

  if (!usuario?.empresa_id) {
    if (isBootstrapSuperAdminEmail(user.email)) {
      return { ok: false, status: 403, message: "Seleccioná una empresa para usar Plan de Cuentas" };
    }
    return { ok: false, status: 403, message: "Usuario sin empresa" };
  }

  const rol = (usuario.rol ?? "").trim();
  const esAdmin =
    rol === "super_admin" ||
    isBootstrapSuperAdminEmail(user.email) ||
    esRolAdminEmpresaOGlobal(rol);

  if (!esAdmin) {
    // No es admin: permitir si tiene el módulo `contabilidad` (el Plan de Cuentas es
    // parte de Contabilidad, no una configuración global). Pedido Living Room.
    const modulos = await resolveEffectiveModules(catalog, {
      id: usuario.id,
      empresa_id: usuario.empresa_id,
      rol: usuario.rol,
    });
    const tieneContabilidad = modulos.some(
      (m) => (m.slug ?? "").trim().toLowerCase() === "contabilidad"
    );
    if (!tieneContabilidad) {
      return {
        ok: false,
        status: 403,
        message: "Solo administradores o Contabilidad pueden acceder al Plan de Cuentas",
      };
    }
  }

  return {
    ok: true,
    empresaId: usuario.empresa_id,
    usuarioCatalogId: usuario.id,
    usuarioEmail: user.email ?? null,
    rol: usuario.rol,
    canEdit: true,
  };
}
