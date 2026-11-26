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

const METODOS = ["efectivo", "transferencia", "cheque", "otro"];

async function listarPagos(sb: AppSupabaseClient, emp: string, ordenId: string) {
  const pq = await sb.from("prod_contratista_pagos").select("id, monto, fecha, metodo_pago, observaciones, comprobante_path, created_by_nombre, created_at")
    .eq("empresa_id", emp).eq("orden_id", ordenId).order("fecha", { ascending: true }).order("created_at", { ascending: true });
  const rows = (pq.data ?? []) as (Record<string, unknown> & { comprobante_path: string | null })[];
  return Promise.all(rows.map(async (r) => ({ ...r, comprobante_url: r.comprobante_path ? await signProduccionArchivo(sb, r.comprobante_path) : null })));
}

/** GET — pagos registrados de la cotización. */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { ordenId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sb = ctx.supabase as unknown as AppSupabaseClient;
    return NextResponse.json(successResponse({ pagos: await listarPagos(sb, ctx.auth.empresa_id, ordenId) }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** POST — registra un pago/adelanto (multipart: monto, fecha, metodo_pago, observaciones, file opcional). No toca el importe aprobado ni genera gastos. */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { ordenId } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;

    const oq = await sb.from("prod_contratista_ordenes").select("id, proyecto_id, contratista_id, estado, importe_aprobado, importe_pagado").eq("empresa_id", emp).eq("id", ordenId).maybeSingle();
    if (oq.error || !oq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const o = oq.data as { proyecto_id: string; contratista_id: string | null; estado: string; importe_aprobado: number; importe_pagado: number };
    if (o.estado !== "aprobada") return NextResponse.json(errorResponse("Solo se registran pagos sobre una cotización aprobada."), { status: 400 });

    const form = await request.formData();
    const monto = Math.round((Number(form.get("monto")) || 0) * 100) / 100;
    if (!(monto > 0)) return NextResponse.json(errorResponse("Ingresá un monto mayor a cero."), { status: 400 });
    const pagado = Number(o.importe_pagado) || 0;
    const saldo = (Number(o.importe_aprobado) || 0) - pagado;
    if (monto > saldo + 0.001) return NextResponse.json(errorResponse(`El monto supera el saldo pendiente (₲ ${Math.round(saldo).toLocaleString("es-PY")}).`), { status: 400 });
    const fechaRaw = String(form.get("fecha") ?? "");
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw) ? fechaRaw : new Date().toISOString().slice(0, 10);
    const metodoRaw = String(form.get("metodo_pago") ?? "efectivo");
    const metodo = METODOS.includes(metodoRaw) ? metodoRaw : "otro";
    const observaciones = String(form.get("observaciones") ?? "").trim() || null;

    let comprobante_path: string | null = null;
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      if (!ALLOWED_PRODUCCION_MIME.has(file.type)) return NextResponse.json(errorResponse("Formato no permitido. Usá JPG, PNG, WebP o PDF."), { status: 400 });
      if (file.size > MAX_PRODUCCION_BYTES) return NextResponse.json(errorResponse("El comprobante es muy grande (máx. 10 MB)."), { status: 413 });
      try { await ensureProduccionArchivosBucket(sb); } catch (e) { console.error("[ordenes/pagos] ensureBucket", e instanceof Error ? e.message : e); }
      const path = buildProduccionPath(emp, "comprobante", randomUUID(), file.type);
      const up = await sb.storage.from(PRODUCCION_ARCHIVOS_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
      if (up.error) return NextResponse.json(errorResponse(`No se pudo subir el comprobante: ${up.error.message}`), { status: 500 });
      comprobante_path = path;
    }

    const ins = await sb.from("prod_contratista_pagos").insert({
      empresa_id: emp, proyecto_id: o.proyecto_id, orden_id: ordenId, contratista_id: o.contratista_id,
      monto, fecha, metodo_pago: metodo, observaciones, comprobante_path,
      created_by: ctx.auth.user?.id ?? null, created_by_nombre: ctx.auth.user?.email ?? null,
    });
    if (ins.error) {
      if (comprobante_path) { try { await sb.storage.from(PRODUCCION_ARCHIVOS_BUCKET).remove([comprobante_path]); } catch { /* best-effort */ } }
      return NextResponse.json(errorResponse(ins.error.message), { status: 400 });
    }
    // Total pagado = suma del historial (solo informativo: no cambia el importe aprobado ni crea gastos).
    const sq = await sb.from("prod_contratista_pagos").select("monto").eq("empresa_id", emp).eq("orden_id", ordenId);
    const total = ((sq.data ?? []) as { monto: number }[]).reduce((a, r) => a + (Number(r.monto) || 0), 0);
    await sb.from("prod_contratista_ordenes").update({ importe_pagado: total, updated_at: new Date().toISOString() }).eq("empresa_id", emp).eq("id", ordenId);

    return NextResponse.json(successResponse({ importe_pagado: total, pagos: await listarPagos(sb, emp, ordenId) }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
