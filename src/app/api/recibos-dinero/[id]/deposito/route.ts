import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esInstanciaLR } from "@/lib/inventario/campos-lr";
import { validarMovimiento, ErrorTesoreria } from "@/lib/tesoreria/server";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import {
  ALLOWED_DEPOSITO_MIME,
  MAX_DEPOSITO_BYTES,
  RECIBOS_DEPOSITOS_BUCKET,
  buildDepositoPath,
  depositoPathBelongsToEmpresa,
  ensureRecibosDepositosBucket,
  signDeposito,
} from "@/lib/recibos/deposito-storage";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/recibos-dinero/[id]/deposito
 *   - sin query: info del depósito (banco, fecha, url firmada de la foto).
 *   - ?foto=1: redirige a la URL firmada de la foto del depósito.
 */
export async function GET(request: NextRequest, p: Params) {
  const { id } = await p.params;
  const soloFoto = new URL(request.url).searchParams.get("foto") === "1";
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const { supabase, auth } = ctx;

  const rq = await supabase
    .from("recibos_dinero")
    .select("deposito_entidad_bancaria_id, deposito_foto_path, deposito_fecha, deposito_banco_movimiento_id")
    .eq("empresa_id", auth.empresa_id)
    .eq("id", id)
    .maybeSingle();
  if (rq.error || !rq.data) return NextResponse.json(errorResponse("Recibo no encontrado."), { status: 404 });
  const r = rq.data as Record<string, unknown>;
  const path = (r.deposito_foto_path as string) || null;

  if (soloFoto) {
    if (!path || !depositoPathBelongsToEmpresa(path, auth.empresa_id)) {
      return new NextResponse("Sin foto de depósito", { status: 404 });
    }
    const url = await signDeposito(supabase as unknown as AppSupabaseClient, path);
    if (!url) return new NextResponse("No se pudo abrir la foto", { status: 404 });
    return NextResponse.redirect(url);
  }

  let banco: string | null = null;
  if (r.deposito_entidad_bancaria_id) {
    const b = await supabase.from("entidades_bancarias").select("nombre").eq("empresa_id", auth.empresa_id).eq("id", String(r.deposito_entidad_bancaria_id)).maybeSingle();
    banco = (b.data as { nombre?: string } | null)?.nombre ?? null;
  }
  const foto_url = path ? await signDeposito(supabase as unknown as AppSupabaseClient, path) : null;
  return NextResponse.json(successResponse({
    depositado: !!r.deposito_banco_movimiento_id,
    entidad_bancaria_id: (r.deposito_entidad_bancaria_id as string) || null,
    banco,
    fecha: (r.deposito_fecha as string) || null,
    foto_url,
  }));
}

/**
 * POST /api/recibos-dinero/[id]/deposito — registra el depósito a banco del recibo.
 * Living Room (esqueletoerp). Multipart: entidad_bancaria_id, fecha?, file? (foto).
 * Crea un movimiento de banco tipo "deposito" (ingreso) para que figure en el
 * banco y guarda la foto del comprobante. Si el recibo ya tiene depósito, avisa.
 */
export async function POST(request: NextRequest, p: Params) {
  try {
    if (!esInstanciaLR()) {
      return NextResponse.json(errorResponse("Función no disponible."), { status: 404 });
    }
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const emp = auth.empresa_id;

    const form = await request.formData();
    const bancoId = String(form.get("entidad_bancaria_id") ?? "").trim();
    if (!bancoId) return NextResponse.json(errorResponse("Elegí el banco del depósito."), { status: 400 });
    const fechaRaw = String(form.get("fecha") ?? "").trim();
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw) ? fechaRaw : new Date().toISOString().slice(0, 10);

    // Recibo
    const rq = await supabase
      .from("recibos_dinero")
      .select("id, numero_recibo, moneda, monto, anulado, deposito_banco_movimiento_id")
      .eq("empresa_id", emp)
      .eq("id", id)
      .maybeSingle();
    if (rq.error || !rq.data) return NextResponse.json(errorResponse("Recibo no encontrado."), { status: 404 });
    const rec = rq.data as Record<string, unknown>;
    if (rec.anulado) return NextResponse.json(errorResponse("El recibo está anulado."), { status: 400 });
    if (rec.deposito_banco_movimiento_id) {
      return NextResponse.json(errorResponse("Este recibo ya tiene un depósito registrado."), { status: 409 });
    }
    const moneda = (rec.moneda as string) === "USD" ? "USD" : "PYG";
    const monto = Number(rec.monto) || 0;
    if (!(monto > 0)) return NextResponse.json(errorResponse("El recibo no tiene monto."), { status: 400 });

    // Banco: existe, activo y misma moneda que el recibo (ingreso, no chequea saldo).
    await validarMovimiento(supabase as unknown as AppSupabaseClient, emp, "BANCO", bancoId, moneda, monto, { ingreso: true });

    // Foto del depósito (opcional pero recomendada).
    let fotoPath: string | null = null;
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      if (!ALLOWED_DEPOSITO_MIME.has(file.type)) {
        return NextResponse.json(errorResponse("Formato de foto no permitido. Usá JPG, PNG, WebP o PDF."), { status: 400 });
      }
      if (file.size > MAX_DEPOSITO_BYTES) {
        const mb = (MAX_DEPOSITO_BYTES / 1024 / 1024).toFixed(0);
        return NextResponse.json(errorResponse(`La foto es muy grande (máx. ${mb} MB).`), { status: 413 });
      }
      try {
        await ensureRecibosDepositosBucket(supabase as unknown as AppSupabaseClient);
      } catch (bucketErr) {
        console.error("[recibos/deposito] ensureBucket", bucketErr instanceof Error ? bucketErr.message : bucketErr);
      }
      const path = buildDepositoPath(emp, randomUUID(), file.type);
      const buf = Buffer.from(await file.arrayBuffer());
      const up = await supabase.storage.from(RECIBOS_DEPOSITOS_BUCKET).upload(path, buf, { contentType: file.type, upsert: false });
      if (up.error) {
        console.error("[recibos/deposito] upload", { emp, message: up.error.message });
        return NextResponse.json(errorResponse(`No se pudo subir la foto: ${up.error.message}`), { status: 500 });
      }
      fotoPath = path;
    }

    // Movimiento de banco (ingreso) para que figure en el banco.
    const quien = { created_by_user_id: auth.usuarioCatalogId ?? null, usuario_nombre: auth.user?.email ?? null };
    const concepto = `Depósito recibo ${String(rec.numero_recibo ?? "")}`.trim().slice(0, 200);
    const mov = await supabase
      .from("banco_movimientos")
      .insert({ empresa_id: emp, entidad_bancaria_id: bancoId, tipo: "deposito", monto, moneda, fecha, observacion: concepto, recibo_dinero_id: id, ...quien })
      .select("id")
      .single();
    if (mov.error) {
      // Si falló el movimiento, borrar la foto que ya subimos para no dejar basura.
      if (fotoPath) { try { await supabase.storage.from(RECIBOS_DEPOSITOS_BUCKET).remove([fotoPath]); } catch { /* best-effort */ } }
      throw new Error(mov.error.message);
    }
    const movId = (mov.data as { id: string }).id;

    // Guardar el depósito en el recibo.
    const upd = await supabase
      .from("recibos_dinero")
      .update({
        deposito_entidad_bancaria_id: bancoId,
        deposito_foto_path: fotoPath,
        deposito_fecha: fecha,
        deposito_banco_movimiento_id: movId,
        updated_at: new Date().toISOString(),
      })
      .eq("empresa_id", emp)
      .eq("id", id);
    if (upd.error) {
      // Revertir el movimiento y la foto si no se pudo guardar el vínculo.
      try { await supabase.from("banco_movimientos").delete().eq("empresa_id", emp).eq("id", movId); } catch { /* best-effort */ }
      if (fotoPath) { try { await supabase.storage.from(RECIBOS_DEPOSITOS_BUCKET).remove([fotoPath]); } catch { /* best-effort */ } }
      throw new Error(upd.error.message);
    }

    const foto_url = fotoPath ? await signDeposito(supabase as unknown as AppSupabaseClient, fotoPath) : null;
    return NextResponse.json(successResponse({ ok: true, banco_movimiento_id: movId, foto_url }), { status: 201 });
  } catch (err) {
    if (err instanceof ErrorTesoreria) return NextResponse.json(errorResponse(err.message), { status: 400 });
    console.error("[recibos/deposito POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo registrar el depósito."), { status: 500 });
  }
}
