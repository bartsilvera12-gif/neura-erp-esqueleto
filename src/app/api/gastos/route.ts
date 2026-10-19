import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esInstanciaLR } from "@/lib/inventario/campos-lr";
import { validarMovimiento, ErrorTesoreria } from "@/lib/tesoreria/server";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

/**
 * GET /api/gastos
 * Gastos operativos del tenant (service role).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase, auth } = ctx;
    const { data, error } = await supabase
      .from("gastos")
      .select("*")
      .eq("empresa_id", auth.empresa_id)
      .order("fecha", { ascending: false });

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }
    return NextResponse.json(successResponse(data ?? []));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/**
 * POST /api/gastos — crea un gasto. Living Room (esqueletoerp): además puede
 * marcar si es sin factura / facturado, elegir cuenta contable e indicar de
 * dónde salió el dinero (banco o caja chica), registrando el egreso que baja el
 * saldo. En otros clientes se crea el gasto básico, como antes.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const emp = auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const monto = Number(b.monto);
    if (!(monto > 0)) return NextResponse.json(errorResponse("El monto debe ser mayor a 0."), { status: 400 });
    const fecha = String(b.fecha ?? "").trim() || new Date().toISOString().slice(0, 10);

    const row: Record<string, unknown> = {
      empresa_id: emp,
      categoria: String(b.categoria ?? "").trim() || null,
      descripcion: String(b.descripcion ?? "").trim() || null,
      monto,
      tipo: b.tipo === "fijo" ? "fijo" : "variable",
      recurrente: b.recurrente === true,
      frecuencia: String(b.frecuencia ?? "").trim() || null,
      fecha,
      proyecto_id: b.proyecto_id ? String(b.proyecto_id) : null,
    };

    // Origen del dinero (solo Living Room): banco o caja chica. El gasto en Gs.
    const lr = esInstanciaLR();
    const origenMedio = lr ? (b.origen_medio === "BANCO" || b.origen_medio === "CAJA_CHICA" ? b.origen_medio : null) : null;
    const origenId = origenMedio ? String(b.origen_cuenta_id ?? "") : "";
    const moneda = "PYG";

    if (lr) {
      row.facturado = b.facturado !== false; // por defecto facturado
      row.cuenta_contable_id = b.cuenta_contable_id ? String(b.cuenta_contable_id) : null;
      row.entidad_bancaria_id = origenMedio === "BANCO" ? origenId : null;
      row.caja_chica_id = origenMedio === "CAJA_CHICA" ? origenId : null;
    }

    // Si sale de banco/caja, validar ANTES de crear nada (tope/saldo/moneda).
    if (origenMedio) {
      if (!origenId) return NextResponse.json(errorResponse("Elegí el banco o la caja chica de origen."), { status: 400 });
      await validarMovimiento(supabase as unknown as AppSupabaseClient, emp, origenMedio as "BANCO" | "CAJA_CHICA", origenId, moneda, monto);
    }

    const ins = await supabase.from("gastos").insert(row).select().single();
    if (ins.error) throw new Error(ins.error.message);
    const gasto = ins.data as { id: string };

    // Registrar el egreso que baja el saldo del banco / caja chica.
    if (origenMedio) {
      const quien = { created_by_user_id: auth.usuarioCatalogId ?? null, usuario_nombre: auth.user?.email ?? null };
      const concepto = `Gasto ${(row.categoria as string) || (row.descripcion as string) || ""}`.trim().slice(0, 200);
      const mov = origenMedio === "BANCO"
        ? await supabase.from("banco_movimientos").insert({ empresa_id: emp, entidad_bancaria_id: origenId, tipo: "retiro", monto, moneda, fecha, observacion: concepto, gasto_id: gasto.id, ...quien }).select("id").single()
        : await supabase.from("caja_chica_movimientos").insert({ empresa_id: emp, caja_chica_id: origenId, tipo: "gasto", monto, fecha, observacion: concepto, gasto_id: gasto.id, ...quien }).select("id").single();
      if (mov.error) {
        // No dejar el gasto sin su egreso: revertir.
        await supabase.from("gastos").delete().eq("empresa_id", emp).eq("id", gasto.id);
        throw new Error(mov.error.message);
      }
    }

    return NextResponse.json(successResponse(ins.data), { status: 201 });
  } catch (err) {
    if (err instanceof ErrorTesoreria) return NextResponse.json(errorResponse(err.message), { status: 400 });
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
