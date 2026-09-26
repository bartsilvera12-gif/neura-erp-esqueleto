import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  COMEX_ADJUNTOS_BUCKET,
  MAX_ADJUNTO_BYTES,
  MIME_ADJUNTO_PERMITIDO,
  ORIGENES,
  asegurarBucketAdjuntos,
  getComexCtx,
  nombreUsuario,
  operacionCerrada,
  operacionDeOrigen,
  registrarHistorial,
  rutaAdjunto,
} from "@/lib/comex/server";
import type { OrigenComex } from "@/lib/comex/types";

function origenDe(sp: URLSearchParams) {
  const t = sp.get("origen_tipo") as OrigenComex | null;
  const id = sp.get("origen_id");
  return t && ORIGENES.has(t) && id ? { tipo: t, id } : null;
}

/** GET ?origen_tipo=&origen_id= — documentos con enlace temporal para abrirlos. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const o = origenDe(new URL(request.url).searchParams);
    if (!o) return NextResponse.json(errorResponse("Falta la operación."), { status: 400 });
    const { data, error } = await ctx.supabase
      .from("comex_adjuntos")
      .select("id, categoria, nombre, mime_type, size_bytes, storage_path, usuario_nombre, created_at")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("origen_tipo", o.tipo)
      .eq("origen_id", o.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const adjuntos = await Promise.all(
      ((data ?? []) as { storage_path: string }[]).map(async ({ storage_path, ...a }) => {
        const { data: s } = await ctx.supabase.storage.from(COMEX_ADJUNTOS_BUCKET).createSignedUrl(storage_path, 3600);
        return { ...a, url: s?.signedUrl ?? null };
      })
    );
    return NextResponse.json(successResponse({ adjuntos }));
  } catch (err) {
    console.error("[/api/comex/adjuntos GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar los documentos."), { status: 500 });
  }
}

/** POST multipart: origen_tipo, origen_id, categoria, file (uno o varios). */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const form = await request.formData();
    const tipo = String(form.get("origen_tipo") ?? "") as OrigenComex;
    const origenId = String(form.get("origen_id") ?? "");
    const categoria = String(form.get("categoria") ?? "").trim().slice(0, 60) || null;
    if (!ORIGENES.has(tipo) || !origenId) return NextResponse.json(errorResponse("Falta la operación."), { status: 400 });
    const op = await operacionDeOrigen(ctx.supabase, ctx.auth.empresa_id, tipo, origenId);
    if (!op) return NextResponse.json(errorResponse("Operación no encontrada."), { status: 404 });
    if (operacionCerrada(op.estado)) return NextResponse.json(errorResponse("La operación está cerrada o anulada: no se pueden agregar documentos."), { status: 400 });

    const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) return NextResponse.json(errorResponse("Elegí un archivo."), { status: 400 });
    await asegurarBucketAdjuntos(ctx.supabase);

    const errores: string[] = [];
    const subidos: string[] = [];
    for (const file of files) {
      if (!MIME_ADJUNTO_PERMITIDO.has(file.type)) {
        errores.push(`"${file.name}": formato no permitido (PDF, imagen, Word, Excel o texto).`);
        continue;
      }
      if (file.size > MAX_ADJUNTO_BYTES) {
        errores.push(`"${file.name}": supera los 25 MB.`);
        continue;
      }
      const adjId = randomUUID();
      const path = rutaAdjunto(ctx.auth.empresa_id, tipo, origenId, adjId, file.type);
      const up = await ctx.supabase.storage.from(COMEX_ADJUNTOS_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
        upsert: false,
      });
      if (up.error) {
        errores.push(`"${file.name}": no se pudo subir.`);
        continue;
      }
      const { error } = await ctx.supabase.from("comex_adjuntos").insert({
        id: adjId,
        empresa_id: ctx.auth.empresa_id,
        origen_tipo: tipo,
        origen_id: origenId,
        categoria,
        nombre: file.name.slice(0, 200),
        mime_type: file.type,
        size_bytes: file.size,
        storage_path: path,
        usuario_nombre: nombreUsuario(ctx.auth),
      });
      if (error) {
        await ctx.supabase.storage.from(COMEX_ADJUNTOS_BUCKET).remove([path]);
        errores.push(`"${file.name}": no se pudo registrar.`);
        continue;
      }
      subidos.push(file.name);
    }
    if (subidos.length) await registrarHistorial(ctx.supabase, ctx.auth, tipo, origenId, "ADJUNTAR", { archivos: subidos, categoria });
    if (!subidos.length) return NextResponse.json(errorResponse(errores.join(" ")), { status: 400 });
    return NextResponse.json(successResponse({ subidos, errores }));
  } catch (err) {
    console.error("[/api/comex/adjuntos POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}

/** DELETE ?id= — quita el documento (queda registrado en el historial). */
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json(errorResponse("Falta el documento."), { status: 400 });
    const { data } = await ctx.supabase
      .from("comex_adjuntos")
      .select("origen_tipo, origen_id, nombre, storage_path")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    const a = data as { origen_tipo: OrigenComex; origen_id: string; nombre: string; storage_path: string } | null;
    if (!a) return NextResponse.json(errorResponse("Documento no encontrado."), { status: 404 });
    const op = await operacionDeOrigen(ctx.supabase, ctx.auth.empresa_id, a.origen_tipo, a.origen_id);
    const bloqueaQuitar = !op || operacionCerrada(op.estado) || (op.tipo === "EXPORTACION" && !["preparacion", "documentacion"].includes(op.estado));
    if (bloqueaQuitar)
      return NextResponse.json(errorResponse("Este documento ya no se puede quitar: la operación está aprobada, cerrada o anulada."), { status: 400 });
    const { error } = await ctx.supabase.from("comex_adjuntos").delete().eq("empresa_id", ctx.auth.empresa_id).eq("id", id);
    if (error) throw new Error(error.message);
    await ctx.supabase.storage.from(COMEX_ADJUNTOS_BUCKET).remove([a.storage_path]);
    await registrarHistorial(ctx.supabase, ctx.auth, a.origen_tipo, a.origen_id, "QUITAR_ADJUNTO", { archivo: a.nombre });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/comex/adjuntos DELETE]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
