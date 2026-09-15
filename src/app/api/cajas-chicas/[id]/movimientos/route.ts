import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const TIPOS = new Set(["aporte", "gasto", "retiro", "ajuste", "saldo_inicial"]);

const COLS =
  "id, caja_chica_id, tipo, monto, fecha, referencia, observacion, gasto_id, created_by_user_id, usuario_nombre, created_at";

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("caja_chica_movimientos")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("caja_chica_id", id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ movimientos: data ?? [] }));
  } catch (err) {
    console.error("[/api/cajas-chicas/:id/movimientos GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar los movimientos."), { status: 500 });
  }
}

export async function POST(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const tipo = String(b.tipo ?? "").trim();
    const monto = Number(b.monto);
    if (!TIPOS.has(tipo)) return NextResponse.json(errorResponse("Tipo inválido."), { status: 400 });
    if (!Number.isFinite(monto) || monto === 0) {
      return NextResponse.json(errorResponse("Monto inválido."), { status: 400 });
    }
    if ((tipo === "aporte" || tipo === "gasto" || tipo === "retiro" || tipo === "saldo_inicial") && monto < 0) {
      return NextResponse.json(errorResponse("Monto debe ser positivo para este tipo."), { status: 400 });
    }
    const fecha = typeof b.fecha === "string" && b.fecha ? b.fecha : new Date().toISOString().slice(0, 10);

    const { data, error } = await ctx.supabase
      .from("caja_chica_movimientos")
      .insert({
        empresa_id: ctx.auth.empresa_id,
        caja_chica_id: id,
        tipo,
        monto,
        fecha,
        referencia: b.referencia ? String(b.referencia).trim().slice(0, 100) : null,
        observacion: b.observacion ? String(b.observacion).trim().slice(0, 500) : null,
        gasto_id: b.gasto_id ? String(b.gasto_id) : null,
        created_by_user_id: ctx.auth.usuarioCatalogId ?? null,
        usuario_nombre: ctx.auth.nombre ?? ctx.auth.user?.email ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id: (data as { id: string }).id }));
  } catch (err) {
    console.error("[/api/cajas-chicas/:id/movimientos POST]", err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "Error interno"),
      { status: 500 },
    );
  }
}
