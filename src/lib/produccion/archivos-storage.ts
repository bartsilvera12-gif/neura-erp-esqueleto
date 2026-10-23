/**
 * Storage de archivos del módulo de producción (Living Room).
 *
 * Bucket: `produccion-archivos` (privado).
 * Path:   `{empresa_id}/{categoria}/{uuid}.{ext}`  (categoria: cotizacion | firma | otro)
 *
 * Aislamiento por tenant: el primer segmento del path es `empresa_id` y el
 * endpoint valida el `empresa_id` del usuario antes de leer/escribir.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const PRODUCCION_ARCHIVOS_BUCKET = "produccion-archivos";

export const ALLOWED_PRODUCCION_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf",
]);
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf",
};
export const MAX_PRODUCCION_BYTES = 10 * 1024 * 1024; // 10 MB

let bucketEnsured = false;

/** Crea el bucket privado si no existe. Idempotente. */
export async function ensureProduccionArchivosBucket(supabase: AppSupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  try {
    const { data: existing } = await supabase.storage.getBucket(PRODUCCION_ARCHIVOS_BUCKET);
    if (existing) { bucketEnsured = true; return; }
  } catch { /* fallthrough */ }
  const { error } = await supabase.storage.createBucket(PRODUCCION_ARCHIVOS_BUCKET, {
    public: false, fileSizeLimit: MAX_PRODUCCION_BYTES, allowedMimeTypes: [...ALLOWED_PRODUCCION_MIME],
  });
  if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`No se pudo crear el bucket: ${error.message}`);
  bucketEnsured = true;
}

/** Path nuevo para un archivo de producción. `uuid` debe venir de crypto.randomUUID(). */
export function buildProduccionPath(empresaId: string, categoria: string, uuid: string, mime: string): string {
  const ext = EXT_BY_MIME[mime] ?? "bin";
  const cat = /^[a-z]+$/.test(categoria) ? categoria : "otro";
  return `${empresaId}/${cat}/${uuid}.${ext}`;
}

/** Valida que el path pertenezca a la empresa (primer segmento). */
export function produccionPathBelongsToEmpresa(path: string, empresaId: string): boolean {
  return typeof path === "string" && path.startsWith(`${empresaId}/`);
}

/** URL firmada para visualizar el archivo. Null si el path es inválido o falla. */
export async function signProduccionArchivo(supabase: AppSupabaseClient, path: string, ttl = 3600): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage.from(PRODUCCION_ARCHIVOS_BUCKET).createSignedUrl(path, ttl);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch { return null; }
}
