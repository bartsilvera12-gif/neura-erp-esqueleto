import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import {
  ALLOWED_PRODUCCION_MIME, MAX_PRODUCCION_BYTES, PRODUCCION_ARCHIVOS_BUCKET,
  buildProduccionPath, ensureProduccionArchivosBucket, signProduccionArchivo,
} from "@/lib/produccion/archivos-storage";

type Params = { params: Promise<{ ordenId: string }> };

/** POST — adjunta (o reemplaza) el archivo de la cotización. Multipart: file. */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { ordenId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;

    const oq = await sb.from("prod_contratista_ordenes").select("id, archivo_path").eq("empresa_id", emp).eq("id", ordenId).maybeSingle();
    if (oq.error || !oq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const anterior = (oq.data as { archivo_path: string | null }).archivo_path;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json(errorResponse("Elegí un archivo."), { status: 400 });
    if (!ALLOWED_PRODUCCION_MIME.has(file.type)) return NextResponse.json(errorResponse("Formato no permitido. Usá JPG, PNG, WebP o PDF."), { status: 400 });
    if (file.size > MAX_PRODUCCION_BYTES) return NextResponse.json(errorResponse(`El archivo es muy grande (máx. ${(MAX_PRODUCCION_BYTES / 1024 / 1024).toFixed(0)} MB).`), { status: 413 });

    try { await ensureProduccionArchivosBucket(sb); } catch (e) { console.error("[ordenes/archivo] ensureBucket", e instanceof Error ? e.message : e); }
    const path = buildProduccionPath(emp, "cotizacion", randomUUID(), file.type);
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await sb.storage.from(PRODUCCION_ARCHIVOS_BUCKET).upload(path, buf, { contentType: file.type, upsert: false });
    if (up.error) return NextResponse.json(errorResponse(`No se pudo subir el archivo: ${up.error.message}`), { status: 500 });

    const upd = await sb.from("prod_contratista_ordenes").update({ archivo_path: path, updated_at: new Date().toISOString() }).eq("empresa_id", emp).eq("id", ordenId);
    if (upd.error) {
      try { await sb.storage.from(PRODUCCION_ARCHIVOS_BUCKET).remove([path]); } catch { /* best-effort */ }
      return NextResponse.json(errorResponse(upd.error.message), { status: 400 });
    }
    // Borrar el archivo anterior (best-effort) para no dejar basura.
    if (anterior && anterior !== path) { try { await sb.storage.from(PRODUCCION_ARCHIVOS_BUCKET).remove([anterior]); } catch { /* best-effort */ } }

    const url = await signProduccionArchivo(sb, path);
    return NextResponse.json(successResponse({ archivo_url: url }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
