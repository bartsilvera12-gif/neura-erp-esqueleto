import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth, getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { ensureRegularizacionBucket, MAX_PDF_BYTES, REGULARIZACION_BUCKET } from "@/lib/facturas-exportacion/regularizacion-storage";

export const dynamic = "force-dynamic";

/** GET — redirige al PDF original (URL firmada 10 min). */
export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParams.params;
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { data } = await ctx.supabase
    .from("facturas_regularizacion")
    .select("pdf_path")
    .eq("empresa_id", ctx.auth.empresa_id)
    .eq("id", id)
    .maybeSingle();
  const path = (data as { pdf_path?: string | null } | null)?.pdf_path;
  if (!path) return new Response("Sin PDF", { status: 404 });
  const signed = await ctx.supabase.storage.from(REGULARIZACION_BUCKET).createSignedUrl(path, 600);
  if (signed.error || !signed.data?.signedUrl) return new Response("No se pudo abrir el PDF", { status: 500 });
  return NextResponse.redirect(signed.data.signedUrl);
}

/** POST multipart (file) — adjunta el PDF original. Solo admin. */
export async function POST(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    if (!esRolAdminEmpresaOGlobal(auth.rol))
      return NextResponse.json(errorResponse("Solo un administrador puede adjuntar el PDF."), { status: 403 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json(errorResponse("Falta el archivo."), { status: 400 });
    if (file.type !== "application/pdf") return NextResponse.json(errorResponse("El archivo tiene que ser PDF."), { status: 400 });
    if (file.size > MAX_PDF_BYTES) return NextResponse.json(errorResponse("El PDF supera los 10 MB."), { status: 400 });

    const existe = await supabase
      .from("facturas_regularizacion")
      .select("id")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (!existe.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    await ensureRegularizacionBucket(supabase);
    const path = `${auth.empresa_id}/${id}/original.pdf`;
    const up = await supabase.storage
      .from(REGULARIZACION_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: "application/pdf", upsert: true });
    if (up.error) throw new Error(up.error.message);

    await supabase
      .from("facturas_regularizacion")
      .update({ pdf_path: path, updated_at: new Date().toISOString() })
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id);
    await supabase.from("facturas_exportacion_auditoria").insert({
      empresa_id: auth.empresa_id,
      accion: "REGULARIZACION_ADJUNTAR_PDF",
      detalle: { regularizacion_id: id, archivo: file.name },
      usuario_id: auth.user.id,
      usuario_nombre: auth.nombre ?? auth.user.email ?? null,
    });
    return NextResponse.json(successResponse({ pdf_path: path }));
  } catch (err) {
    console.error("[/api/facturas-regularizacion/[id]/pdf POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo subir el PDF."), { status: 500 });
  }
}
