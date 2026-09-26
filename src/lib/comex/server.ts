/**
 * Helpers de servidor de Comercio Exterior: historial, pertenencia del origen
 * a la empresa y almacenamiento de adjuntos.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import type { UsuarioConEmpresaYRol } from "@/lib/middleware/auth";
import { resolveApiAuthContext } from "@/lib/middleware/api-auth-context";
import { createServiceRoleClientForEmpresa } from "@/lib/supabase/empresa-data-schema";
import type { OrigenComex } from "./types";

/**
 * Sesión + cliente de la empresa para Comercio Exterior. A diferencia de
 * getTenantSupabaseFromAuthWithRol, incluye usuarioCatalogId (el id de
 * `usuarios`), que hace falta para saber si quien opera es el responsable.
 */
export async function getComexCtx(request: Request): Promise<{ auth: UsuarioConEmpresaYRol; supabase: AppSupabaseClient } | null> {
  const r = await resolveApiAuthContext(request);
  if (!r.ok || !r.ctx.empresa_id) return null;
  const auth: UsuarioConEmpresaYRol = {
    user: r.ctx.user,
    empresa_id: r.ctx.empresa_id,
    rol: r.ctx.usuarioRol ?? undefined,
    nombre: r.ctx.usuarioNombre ?? undefined,
    usuarioCatalogId: r.ctx.usuarioCatalogId ?? null,
  };
  const supabase = await createServiceRoleClientForEmpresa(auth.empresa_id);
  return { auth, supabase };
}

/** true si el usuario es el responsable asignado (nunca true si no hay responsable). */
export const esResponsable = (auth: UsuarioConEmpresaYRol, responsableId: string | null | undefined) =>
  !!responsableId && !!auth.usuarioCatalogId && responsableId === auth.usuarioCatalogId;

/** UUID válido (para no mandar basura a PostgREST y recibir un 500). */
export const esUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Texto de búsqueda seguro para `.or(...ilike...)`. */
export const textoBusqueda = (v: string | null) => (v ?? "").trim().replace(/[,()%"\\*_]/g, " ").trim().slice(0, 60);

/** Fecha de hoy en Paraguay (AAAA-MM-DD), no en UTC. */
export const hoyPY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });

export const ORIGENES = new Set<OrigenComex>(["IMPORTACION", "EXPORTACION", "CONTENEDOR"]);

const TABLA_ORIGEN: Record<OrigenComex, string> = {
  IMPORTACION: "importaciones",
  EXPORTACION: "exportaciones",
  CONTENEDOR: "comex_contenedores",
};

export const nombreUsuario = (auth: UsuarioConEmpresaYRol) => auth.nombre ?? auth.user?.email ?? null;

/** Estado de la operación (importación / exportación) o null si no es de la empresa. */
export async function estadoOperacion(
  sb: AppSupabaseClient,
  empresaId: string,
  tipo: "IMPORTACION" | "EXPORTACION",
  id: string
): Promise<string | null> {
  const { data } = await sb.from(TABLA_ORIGEN[tipo]).select("estado").eq("empresa_id", empresaId).eq("id", id).maybeSingle();
  return (data as { estado?: string } | null)?.estado ?? null;
}

/**
 * La operación dueña de un origen (un contenedor pertenece a su importación
 * o exportación). Sirve para aplicar la misma regla de "operación cerrada".
 */
export async function operacionDeOrigen(
  sb: AppSupabaseClient,
  empresaId: string,
  tipo: OrigenComex,
  id: string
): Promise<{ tipo: "IMPORTACION" | "EXPORTACION"; id: string; estado: string } | null> {
  if (tipo !== "CONTENEDOR") {
    const estado = await estadoOperacion(sb, empresaId, tipo, id);
    return estado ? { tipo, id, estado } : null;
  }
  const { data } = await sb.from("comex_contenedores").select("importacion_id, exportacion_id").eq("empresa_id", empresaId).eq("id", id).maybeSingle();
  const c = data as { importacion_id: string | null; exportacion_id: string | null } | null;
  if (!c) return null;
  const op = c.importacion_id ? ("IMPORTACION" as const) : ("EXPORTACION" as const);
  const opId = (c.importacion_id ?? c.exportacion_id) as string;
  const estado = await estadoOperacion(sb, empresaId, op, opId);
  return estado ? { tipo: op, id: opId, estado } : null;
}

export const operacionCerrada = (estado: string) => estado === "cerrada" || estado === "anulada";

/** El contenedor existe, es de la empresa y de esta operación. */
export async function contenedorDeOperacion(
  sb: AppSupabaseClient,
  empresaId: string,
  tipo: "IMPORTACION" | "EXPORTACION",
  operacionId: string,
  contenedorId: string
): Promise<boolean> {
  if (!esUuid(contenedorId)) return false;
  const { data } = await sb
    .from("comex_contenedores")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("id", contenedorId)
    .eq(tipo === "IMPORTACION" ? "importacion_id" : "exportacion_id", operacionId)
    .maybeSingle();
  return !!data;
}

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

/**
 * Inserta con el siguiente número PREFIJO-000001. Si dos personas crean a la
 * vez y chocan con el número (índice único), reintenta con el siguiente.
 */
export async function insertarConNumero(
  sb: AppSupabaseClient,
  tabla: "importaciones" | "exportaciones",
  empresaId: string,
  prefijo: "IMP" | "EXP",
  fila: Record<string, unknown>
): Promise<{ id: string; numero: string }> {
  for (let intento = 0; intento < 5; intento++) {
    const { data: ult } = await sb
      .from(tabla)
      .select("numero")
      .eq("empresa_id", empresaId)
      .like("numero", `${prefijo}-%`)
      .order("numero", { ascending: false })
      .limit(1);
    const m = (((ult ?? [])[0] as { numero?: string } | undefined)?.numero ?? "").match(/(\d+)$/);
    const numero = `${prefijo}-${String((m ? Number(m[1]) : 0) + 1 + intento).padStart(6, "0")}`;
    const { data, error } = await sb.from(tabla).insert({ ...fila, empresa_id: empresaId, numero }).select("id, numero").single();
    if (!error) return data as { id: string; numero: string };
    if (error.code !== "23505") throw new Error(error.message);
  }
  throw new Error("No se pudo asignar un número. Probá de nuevo.");
}
