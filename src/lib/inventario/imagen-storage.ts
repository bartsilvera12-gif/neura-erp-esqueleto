/**
 * Storage helpers para imagenes de producto.
 *
 * Bucket: `productos-imagenes` (privado).
 * Path:   `{empresa_id}/{producto_id}/principal.{ext}`
 *
 * Aislamiento por tenant: el primer segmento del path es `empresa_id` y los
 * endpoints siempre validan el `empresa_id` del usuario antes de leer/escribir.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const PRODUCTOS_IMAGENES_BUCKET = "productos-imagenes";

export const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
export const ALLOWED_IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

let bucketEnsured = false;

/**
 * Crea el bucket privado si no existe. Idempotente. Cachea el flag en memoria
 * del proceso para no llamar listBuckets en cada request.
 *
 * Requiere un cliente con service role (puede ser el del tenant ya que las
 * operaciones de storage usan la misma key).
 */
export async function ensureProductosImagenesBucket(supabase: AppSupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  try {
    const { data: existing } = await supabase.storage.getBucket(PRODUCTOS_IMAGENES_BUCKET);
    if (existing) {
      bucketEnsured = true;
      return;
    }
  } catch {
    // fallthrough — intentar crear
  }
  const { error: createErr } = await supabase.storage.createBucket(PRODUCTOS_IMAGENES_BUCKET, {
    public: false,
    fileSizeLimit: MAX_IMAGE_BYTES,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (createErr && !/already exists|duplicate/i.test(createErr.message)) {
    throw new Error(`No se pudo crear el bucket: ${createErr.message}`);
  }
  bucketEnsured = true;
}

export function buildProductoImagenPath(empresaId: string, productoId: string, mime: string): string {
  const ext = ALLOWED_IMAGE_EXT[mime] ?? "bin";
  return `${empresaId}/${productoId}/principal.${ext}`;
}

/**
 * Genera URL firmada para visualizar la imagen. TTL por defecto 1h.
 * Devuelve null si el path es inválido o si falla.
 */
export async function signProductoImagen(
  supabase: AppSupabaseClient,
  imagenPath: string | null | undefined,
  ttlSeconds = 3600
): Promise<string | null> {
  if (!imagenPath) return null;
  try {
    const { data, error } = await supabase.storage
      .from(PRODUCTOS_IMAGENES_BUCKET)
      .createSignedUrl(imagenPath, ttlSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Valida que el path pertenezca a la empresa indicada (primer segmento).
 * Previene cross-tenant en operaciones que reciben paths arbitrarios.
 */
export function pathBelongsToEmpresa(path: string | null | undefined, empresaId: string): boolean {
  if (!path) return false;
  const seg = path.split("/")[0];
  return seg === empresaId;
}

/**
 * Valida una URL para descarga de imagen (anti-SSRF básico): solo http/https y
 * sin apuntar a hosts locales/privados. Devuelve la URL parseada o null.
 */
function parseSafeImageUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return null;
  }
  // Rangos IP privados / loopback / link-local más comunes.
  if (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return null;
  }
  return u;
}

export type FetchImagenResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

/**
 * Descarga una imagen desde una URL pública y la guarda como imagen principal
 * del producto en el bucket privado. Uso: importador de productos (admin).
 *
 * Candados: solo http/https, no hosts privados, timeout, tipo de imagen
 * permitido (jpg/png/webp) y tamaño máximo (5 MB).
 */
export async function fetchAndStoreProductoImagenFromUrl(
  supabase: AppSupabaseClient,
  empresaId: string,
  productoId: string,
  rawUrl: string
): Promise<FetchImagenResult> {
  const u = parseSafeImageUrl(rawUrl);
  if (!u) return { ok: false, error: "URL inválida o no permitida." };

  let resp: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    resp = await fetch(u.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "neura-erp-import", accept: "image/*" },
    });
  } catch {
    clearTimeout(timeout);
    return { ok: false, error: "No se pudo descargar (timeout o red)." };
  }
  clearTimeout(timeout);

  if (!resp.ok) return { ok: false, error: `Descarga falló (HTTP ${resp.status}).` };

  const declaredLen = Number(resp.headers.get("content-length") ?? "0");
  if (declaredLen && declaredLen > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Imagen demasiado grande (máx. 5 MB)." };
  }

  const ct = (resp.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_MIME.has(ct)) {
    return { ok: false, error: `Formato no permitido (${ct || "desconocido"}). Usá JPG, PNG o WebP.` };
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length === 0) return { ok: false, error: "La imagen está vacía." };
  if (buf.length > MAX_IMAGE_BYTES) return { ok: false, error: "Imagen demasiado grande (máx. 5 MB)." };

  try {
    await ensureProductosImagenesBucket(supabase);
  } catch {
    // Continuar: el upload puede andar si el bucket ya existe.
  }

  const path = buildProductoImagenPath(empresaId, productoId, ct);
  const up = await supabase.storage
    .from(PRODUCTOS_IMAGENES_BUCKET)
    .upload(path, buf, { contentType: ct, upsert: true });
  if (up.error) return { ok: false, error: up.error.message };

  return { ok: true, path };
}
