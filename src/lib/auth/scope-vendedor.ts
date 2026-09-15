import { getAuthWithRol } from "@/lib/middleware/auth";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";

/**
 * Alcance de "sus documentos" para vendedores (PDF §1).
 *
 * - Admin (empresa o super): ve todos los documentos.
 * - Cualquier otro rol: solo los documentos que creó él (created_by_user_id).
 */
export type VendedorScope =
  | { esAdmin: true; userId: null }
  | { esAdmin: false; userId: string | null };

/**
 * Resuelve el scope del usuario actual para el filtrado en listados de ventas,
 * presupuestos y demás documentos comerciales.
 */
export async function resolveVendedorScope(request?: Request | null): Promise<VendedorScope> {
  const auth = await getAuthWithRol(request);
  if (!auth) return { esAdmin: false, userId: null };
  if (esRolAdminEmpresaOGlobal(auth.rol)) {
    return { esAdmin: true, userId: null };
  }
  return { esAdmin: false, userId: auth.usuarioCatalogId ?? null };
}
