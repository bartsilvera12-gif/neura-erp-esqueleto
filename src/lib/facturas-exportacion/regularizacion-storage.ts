import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const REGULARIZACION_BUCKET = "facturas-regularizacion";
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

let bucketOk = false;

export async function ensureRegularizacionBucket(supabase: AppSupabaseClient): Promise<void> {
  if (bucketOk) return;
  try {
    const { data } = await supabase.storage.getBucket(REGULARIZACION_BUCKET);
    if (data) {
      bucketOk = true;
      return;
    }
  } catch {
    /* no existe: se crea */
  }
  const { error } = await supabase.storage.createBucket(REGULARIZACION_BUCKET, {
    public: false,
    fileSizeLimit: MAX_PDF_BYTES,
    allowedMimeTypes: ["application/pdf"],
  });
  if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(error.message);
  bucketOk = true;
}
