/**
 * Helpers de servidor de Comercio Exterior: historial, pertenencia del origen
 * a la empresa y almacenamiento de adjuntos.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import type { UsuarioConEmpresaYRol } from "@/lib/middleware/auth";
import type { OrigenComex } from "./types";

export const ORIGENES = new Set<OrigenComex>(["IMPORTACION", "EXPORTACION", "CONTENEDOR"]);

const TABLA_ORIGEN: Record<OrigenComex, string> = {
  IMPORTACION: "importaciones",
  EXPORTACION: "exportaciones",
  CONTENEDOR: "comex_contenedores",
};

export const nombreUsuario = (auth: UsuarioConEmpresaYRol) => auth.nombre ?? auth.user?.email ?? null;

/** true si el registro origen existe y es de la empresa del usuario. */
export async function origenDeEmpresa(
  sb: AppSupabaseClient,
  empresaId: string,
  tipo: OrigenComex,
  id: string
): Promise<boolean> {
  const { data, error } = await sb.from(TABLA_ORIGEN[tipo]).select("id").eq("empresa_id", empresaId).eq("id", id).maybeSingle();
  return !error && !!data;
}

/** Registra una acción en el historial. Nunca hace fallar la operación principal. */
export async function registrarHistorial(
  sb: AppSupabaseClient,
  auth: UsuarioConEmpresaYRol,
  origenTipo: OrigenComex,
  origenId: string,
  accion: string,
  detalle?: Record<string, unknown>
): Promise<void> {
  const { error } = await sb.from("comex_historial").insert({
    empresa_id: auth.empresa_id,
    origen_tipo: origenTipo,
    origen_id: origenId,
    accion,
    detalle: detalle ?? null,
    usuario_id: auth.usuarioCatalogId ?? null,
    usuario_nombre: nombreUsuario(auth),
  });
  if (error) console.error("[comex historial]", accion, error.message);
}

/** Solo los campos que cambiaron, como { campo: { antes, despues } }. */
export function diferencias(antes: Record<string, unknown>, cambios: Record<string, unknown>) {
  const out: Record<string, { antes: unknown; despues: unknown }> = {};
  for (const [k, v] of Object.entries(cambios)) {
    if (k === "updated_at") continue;
    const a = antes[k] ?? null;
    const d = v ?? null;
    if (String(a) !== String(d)) out[k] = { antes: a, despues: d };
  }
  return out;
}

// ── Adjuntos ─────────────────────────────────────────────────────────────────
export const COMEX_ADJUNTOS_BUCKET = "comex-adjuntos";
export const MAX_ADJUNTO_BYTES = 25 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "text/plain": "txt",
};
export const MIME_ADJUNTO_PERMITIDO = new Set(Object.keys(MIME_EXT));

let bucketListo = false;
export async function asegurarBucketAdjuntos(sb: AppSupabaseClient): Promise<void> {
  if (bucketListo) return;
  const { data } = await sb.storage.getBucket(COMEX_ADJUNTOS_BUCKET).catch(() => ({ data: null }));
  if (!data) {
    const { error } = await sb.storage.createBucket(COMEX_ADJUNTOS_BUCKET, { public: false, fileSizeLimit: MAX_ADJUNTO_BYTES });
    if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(error.message);
  }
  bucketListo = true;
}

export function rutaAdjunto(empresaId: string, origenTipo: OrigenComex, origenId: string, adjuntoId: string, mime: string) {
  return `${empresaId}/${origenTipo.toLowerCase()}/${origenId}/${adjuntoId}.${MIME_EXT[mime] ?? "bin"}`;
}
