/**
 * Storage helpers para la foto del depósito a banco de un recibo (Living Room).
 *
 * Bucket: `recibos-depositos` (privado).
 * Path:   `{empresa_id}/{uuid}.{ext}`
 *
 * Aislamiento por tenant: el primer segmento del path es `empresa_id` y el
 * endpoint valida el `empresa_id` del usuario antes de leer/escribir.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const RECIBOS_DEPOSITOS_BUCKET = "recibos-depositos";

// La foto del depósito suele venir como imagen o PDF.
export const ALLOWED_DEPOSITO_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};
export const MAX_DEPOSITO_BYTES = 10 * 1024 * 1024; // 10 MB

let bucketEnsured = false;

/** Crea el bucket privado si no existe. Idempotente. */
export async function ensureRecibosDepositosBucket(supabase: AppSupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  try {
    const { data: existing } = await supabase.storage.getBucket(RECIBOS_DEPOSITOS_BUCKET);
    if (existing) { bucketEnsured = true; return; }
  } catch {
    // fallthrough — intentar crear
  }
  const { error: createErr } = await supabase.storage.createBucket(RECIBOS_DEPOSITOS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_DEPOSITO_BYTES,
    allowedMimeTypes: [...ALLOWED_DEPOSITO_MIME],
  });
  if (createErr && !/already exists|duplicate/i.test(createErr.message)) {
    throw new Error(`No se pudo crear el bucket: ${createErr.message}`);
  }
  bucketEnsured = true;
}

/** Path nuevo para la foto de un depósito. `uuid` debe venir de crypto.randomUUID(). */
export function buildDepositoPath(empresaId: string, uuid: string, mime: string): string {
  const ext = EXT_BY_MIME[mime] ?? "bin";
  return `${empresaId}/${uuid}.${ext}`;
}

/** URL firmada para visualizar la foto. Null si el path es inválido o falla. */
export async function signDeposito(
  supabase: AppSupabaseClient,
  storagePath: string | null | undefined,
  ttlSeconds = 3600
): Promise<string | null> {
  if (!storagePath) return null;
  try {
    const { data, error } = await supabase.storage
      .from(RECIBOS_DEPOSITOS_BUCKET)
      .createSignedUrl(storagePath, ttlSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/** Valida que el path pertenezca a la empresa (primer segmento). */
export function depositoPathBelongsToEmpresa(path: string | null | undefined, empresaId: string): boolean {
  if (!path) return false;
  return path.split("/")[0] === empresaId;
}
