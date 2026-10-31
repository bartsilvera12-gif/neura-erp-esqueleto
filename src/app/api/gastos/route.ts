import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esInstanciaLR } from "@/lib/inventario/campos-lr";
import { validarMovimiento, ErrorTesoreria } from "@/lib/tesoreria/server";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { aSeccion, esSeccion, RECIBO_PREFIJO } from "@/lib/secciones";
import { anioGestionActiva, rangoGestion, gestionCerrada, anioDeFecha } from "@/lib/gestion/gestion-activa";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { contabilizarGasto } from "@/lib/contabilidad/gastos-asientos-pg";

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
    const seccion = new URL(request.url).searchParams.get("seccion");
    // Gestión (año) activa: mostrar solo los gastos de ese año.
    const { desde, hasta } = rangoGestion(anioGestionActiva(request));
    let query = supabase
      .from("gastos")
      .select("*")
      .eq("empresa_id", auth.empresa_id)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false });
    if (esSeccion(seccion)) query = query.eq("seccion", seccion);
    const { data, error } = await query;

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

    // Si la gestión (año) del gasto está cerrada, no se puede cargar (solo lectura).
    const anioGasto = anioDeFecha(fecha) ?? anioGestionActiva(request);
    if (await gestionCerrada(supabase as unknown as AppSupabaseClient, emp, anioGasto)) {
      return NextResponse.json(errorResponse(`La gestión ${anioGasto} está cerrada: no se pueden cargar gastos de ese año.`), { status: 400 });
    }

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

    const seccion = aSeccion(b.seccion);
    if (lr) {
      row.facturado = b.facturado !== false; // por defecto facturado
      row.seccion = seccion;
      row.cuenta_contable_id = b.cuenta_contable_id ? String(b.cuenta_contable_id) : null;
      row.proveedor_nombre = String(b.proveedor_nombre ?? "").trim() || null;
      row.proveedor_documento = String(b.proveedor_documento ?? "").trim() || null;
      row.entidad_bancaria_id = origenMedio === "BANCO" ? origenId : null;
      row.caja_chica_id = origenMedio === "CAJA_CHICA" ? origenId : null;
      // El cliente pide que "de dónde salió" sea obligatorio: todo gasto baja de
      // un banco o una caja chica.
      if (!origenMedio) return NextResponse.json(errorResponse("Elegí de dónde salió el gasto: un banco o una caja chica."), { status: 400 });
    }

    // Si sale de banco/caja, validar ANTES de crear nada (tope/saldo/moneda).
    if (origenMedio) {
      if (!origenId) return NextResponse.json(errorResponse("Elegí el banco o la caja chica de origen."), { status: 400 });
      await validarMovimiento(supabase as unknown as AppSupabaseClient, emp, origenMedio as "BANCO" | "CAJA_CHICA", origenId, moneda, monto);
    }

    // Número de recibo por sección (SHLR/PRLR/CELR) para gastos sin factura.
    const esSinFactura = lr && row.facturado === false;
    let insData: unknown = null;
    let gasto: { id: string } | null = null;
    for (let intento = 0; intento < 6 && !gasto; intento++) {
      if (esSinFactura) {
        const prefijo = RECIBO_PREFIJO[seccion];
        const { data: ult } = await supabase
          .from("gastos")
          .select("recibo_numero")
          .eq("empresa_id", emp)
          .like("recibo_numero", `${prefijo}-%`)
          .order("recibo_numero", { ascending: false })
          .limit(1);
        const ultimo = String((ult as { recibo_numero?: string }[] | null)?.[0]?.recibo_numero ?? "");
        const m = ultimo.match(/(\d+)$/);
        row.recibo_numero = `${prefijo}-${String((m ? Number(m[1]) : 0) + 1 + intento).padStart(6, "0")}`;
      }
      const ins = await supabase.from("gastos").insert(row).select().single();
      if (ins.error) {
        // Si dos recibos chocaron el número, reintentar con el siguiente.
        if (esSinFactura && ins.error.code === "23505" && /recibo/.test(ins.error.message)) continue;
        throw new Error(ins.error.message);
      }
      insData = ins.data;
      gasto = ins.data as { id: string };
    }
    if (!gasto) throw new Error("No se pudo asignar el número de recibo. Probá de nuevo.");

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

    // Contabilización automática del recibo sin factura (best-effort: si falla, el gasto igual quedó guardado).
    if (esSinFactura) {
      try {
        const schema = await fetchDataSchemaForEmpresaId(emp);
        await contabilizarGasto(schema, emp, gasto.id, auth.usuarioCatalogId ?? null);
      } catch (e) { console.error("[contabilizarGasto alta]", e instanceof Error ? e.message : e); }
    }

    return NextResponse.json(successResponse(insData), { status: 201 });
  } catch (err) {
    if (err instanceof ErrorTesoreria) return NextResponse.json(errorResponse(err.message), { status: 400 });
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
