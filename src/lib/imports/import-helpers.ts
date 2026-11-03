/**
 * Helpers compartidos para los importadores Excel.
 * - leerArchivoYAuth: extrae file + auth + schema + checkbox crear_faltantes.
 * - lookupLowerMap: construye un Map(lower(trim(nombre)) -> id) para resolucion por nombre.
 * - chunked: parte un array en chunks de N.
 */
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { parseUploadFile } from "@/lib/excel/import";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

/**
 * Modo de importación de productos:
 * - "actualizar": solo actualiza productos existentes (SKU bloqueado, NO toca stock).
 * - "agregar": solo da de alta productos nuevos (con stock, almacén por defecto).
 * - "ambos": comportamiento clásico (inserta y actualiza).
 */
export type ModoImport = "actualizar" | "agregar" | "ambos";

export interface AuthCtx {
  empresaId: string;
  schema: string;
  usuarioCatalogId: string | null;
  usuarioNombre: string | null;
  filename: string;
  rows: Record<string, string>[];
  crearFaltantes: boolean;
  modo: ModoImport;
  /** Cliente tenant (Storage + PostgREST). Usado p.ej. para imágenes al importar. */
  supabase: AppSupabaseClient;
}

/** Lee form-data, valida auth + admin, parsea xlsx/csv. */
export async function leerArchivoYAuth(request: Request): Promise<
  | { ok: true; ctx: AuthCtx }
  | { ok: false; status: number; error: string }
> {
  const auth = await getAuthWithRol(request);
  if (!auth) return { ok: false, status: 401, error: "No autenticado." };
  if (!isAdmin(auth)) return { ok: false, status: 403, error: "Solo administradores pueden importar." };

  const tenant = await getTenantSupabaseFromAuth(request);
  if (!tenant) return { ok: false, status: 401, error: "No autenticado." };
  const empresaId = tenant.auth.empresa_id;
  const schema = await fetchDataSchemaForEmpresaId(empresaId);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, status: 400, error: "Form-data inválido." };
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return { ok: false, status: 400, error: "Falta el archivo." };
  }
  const parsed = await parseUploadFile(file);
  if ("error" in parsed) return { ok: false, status: 400, error: parsed.error };

  const crearFaltantes = String(form.get("crear_faltantes") ?? "") === "1";
  const modoRaw = String(form.get("modo") ?? "");
  const modo: ModoImport =
    modoRaw === "actualizar" || modoRaw === "agregar" ? modoRaw : "ambos";

  return {
    ok: true,
    ctx: {
      empresaId,
      schema,
      usuarioCatalogId: tenant.auth.usuarioCatalogId ?? null,
      usuarioNombre: tenant.auth.user?.email ?? null,
      filename: file.name,
      rows: parsed.rows,
      crearFaltantes,
      modo,
      supabase: tenant.supabase,
    },
  };
}

export function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * Parsea un número aceptando formatos con punto O coma como decimal.
 *
 * - "25.5"       → 25.5       (formato US / default de Excel al stringificar)
 * - "25,5"       → 25.5       (formato PY)
 * - "1.234,56"   → 1234.56    (PY: punto miles, coma decimal)
 * - "1,234.56"   → 1234.56    (US: coma miles, punto decimal)
 * - "1.234.567"  → 1234567    (PY miles sin decimales)
 * - "1,234,567"  → 1234567    (US miles sin decimales)
 * - "1234"       → 1234
 *
 * La regla es: si están los dos separadores, el que aparece ÚLTIMO es el decimal
 * y el otro son miles. Si hay uno solo: si aparece una vez es decimal, si aparece
 * varias veces son miles.
 */
function parseNumeroLocale(raw: string): number {
  const s = String(raw).trim().replace(/\s/g, "");
  if (!s) return 0;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  let clean: string;
  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    clean = lastComma > lastDot
      ? s.replace(/\./g, "").replace(",", ".")   // PY: 1.234,56
      : s.replace(/,/g, "");                      // US: 1,234.56
  } else if (hasComma) {
    const commas = (s.match(/,/g) ?? []).length;
    clean = commas > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot) {
    const dots = (s.match(/\./g) ?? []).length;
    clean = dots > 1 ? s.replace(/\./g, "") : s;
  } else {
    clean = s;
  }
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

export function pickNumber(row: Record<string, string>, ...keys: string[]): number {
  const raw = pick(row, ...keys);
  if (!raw) return 0;
  return parseNumeroLocale(raw);
}

export function pickBool(row: Record<string, string>, ...keys: string[]): boolean {
  const raw = pick(row, ...keys).toLowerCase();
  if (!raw) return true; // default activo=true
  return ["si", "sí", "true", "1", "yes", "y", "activo"].includes(raw);
}
