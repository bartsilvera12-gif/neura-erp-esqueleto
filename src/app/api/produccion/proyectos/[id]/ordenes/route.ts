import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { MODALIDADES, type Modalidad } from "@/lib/produccion/ordenes-helper";

type Params = { params: Promise<{ id: string }> };

/** GET — órdenes/cotizaciones de contratista del proyecto (la más nueva primero). */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("prod_contratista_ordenes")
      .select("id, contratista_id, contratista_nombre, version, modalidad, estado, importe_solicitado, importe_aprobado, importe_comprometido, importe_pagado, aprobado_por, aprobado_at, created_at")
      .eq("empresa_id", ctx.auth.empresa_id).eq("proyecto_id", id)
      .order("contratista_nombre").order("version", { ascending: false });
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ ordenes: data ?? [] }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** POST — crea una cotización (nueva versión) para un contratista del proyecto. */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { id } = await p.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const pq = await ctx.supabase.from("prod_proyectos").select("id").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (pq.error || !pq.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const contratistaId = String(b.contratista_id ?? "").trim();
    if (!contratistaId) return NextResponse.json(errorResponse("Elegí el contratista."), { status: 400 });
    const cq = await ctx.supabase.from("prod_contratistas").select("nombre").eq("empresa_id", emp).eq("id", contratistaId).maybeSingle();
    if (cq.error || !cq.data) return NextResponse.json(errorResponse("Contratista no encontrado."), { status: 404 });
    const contratistaNombre = (cq.data as { nombre: string }).nombre;
    const modalidad = (MODALIDADES.includes(String(b.modalidad) as Modalidad) ? String(b.modalidad) : "global") as Modalidad;

    const last = await ctx.supabase.from("prod_contratista_ordenes").select("version, importe_aprobado").eq("empresa_id", emp).eq("proyecto_id", id).eq("contratista_id", contratistaId).order("version", { ascending: false }).limit(1);
    const prev = last.data?.[0] as { version?: number; importe_aprobado?: number } | undefined;
    const version = (prev?.version ?? 0) + 1;

    const ins = await ctx.supabase.from("prod_contratista_ordenes").insert({
      empresa_id: emp, proyecto_id: id, contratista_id: contratistaId, contratista_nombre: contratistaNombre,
      version, modalidad, estado: "borrador", importe_anterior: prev?.importe_aprobado ?? null,
      created_by: ctx.auth.usuarioCatalogId ?? null, created_by_nombre: ctx.auth.user?.email ?? null,
    }).select("id, version").single();
    if (ins.error) return NextResponse.json(errorResponse(ins.error.message), { status: 400 });
    return NextResponse.json(successResponse({ orden: ins.data }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
