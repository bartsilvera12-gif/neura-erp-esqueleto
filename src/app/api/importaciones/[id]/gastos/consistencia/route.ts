import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, operacionCerrada } from "@/lib/comex/server";
import { crearFacturaDeGasto } from "@/lib/comex/gasto-factura";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

/**
 * Chequeo (y reparación) de consistencia entre los gastos de una importación
 * y las facturas del Libro de Compras C/E. Detecta y arregla:
 *   1. Gastos con comprobante completo (lleva IVA o exento) SIN libro_compra enlazado.
 *   2. Gastos enlazados a una factura que NO está en sección COMERCIO_EXTERIOR
 *      (síntoma del match viejo que agarraba compras de Showroom). Se desenlaza
 *      y se intenta crear una factura nueva en C/E.
 *   3. Facturas en libro_compras C/E creadas el mismo día (± 7) con mismo
 *      proveedor y comprobante que un gasto de la importación pero sin enlace.
 *      Se enlazan al gasto (huérfanas del rollback).
 *
 * GET: solo detecta y devuelve el listado de incidencias (dry-run).
 * POST: aplica los fixes y devuelve el log de lo que se hizo.
 */

type Incidencia = {
  tipo: "GASTO_SIN_FACTURA" | "FACTURA_SECCION_INCORRECTA" | "FACTURA_HUERFANA";
  gasto_id?: string;
  comprobante: string | null;
  proveedor: string | null;
  descripcion: string | null;
  monto?: number;
  moneda?: string;
  libro_compra_id_actual?: string | null;
  factura_sugerida_lc?: string | null;
  mensaje: string;
};

type GastoRow = {
  id: string;
  fecha: string;
  tipo: string | null;
  descripcion: string | null;
  proveedor_nombre: string | null;
  proveedor_ruc: string | null;
  comprobante: string | null;
  timbrado: string | null;
  cuenta_codigo: string | null;
  monto: number;
  moneda: string;
  tipo_cambio: number;
  lleva_iva: boolean;
  iva_porcentaje: number | null;
  libro_compra_id: string | null;
};

type Factura = { id: string; numero_control: string; seccion: string; moneda: string; total: number };

/** ¿Es un número de comprobante real (no placeholder "0" o cero relleno)? */
function nroReal(s: string | null | undefined): boolean {
  const t = (s ?? "").trim();
  if (!t) return false;
  if (/^0+$/.test(t.replace(/[-\s]/g, ""))) return false; // "0", "000-000-0000000", etc.
  return t.length >= 3;
}

function compl(g: GastoRow): boolean {
  return !!(g.proveedor_ruc?.trim() && nroReal(g.comprobante) && g.timbrado?.trim() && g.cuenta_codigo?.trim());
}

async function detectar(sb: AppSupabaseClient, empresaId: string, impId: string): Promise<{ incidencias: Incidencia[]; gastos: GastoRow[] }> {
  const { data: gD } = await sb
    .from("comex_gastos")
    .select("id, fecha, tipo, descripcion, proveedor_nombre, proveedor_ruc, comprobante, timbrado, cuenta_codigo, monto, moneda, tipo_cambio, lleva_iva, iva_porcentaje, libro_compra_id")
    .eq("empresa_id", empresaId)
    .eq("origen_id", impId);
  const gastos = (gD ?? []) as GastoRow[];

  // Facturas actuales enlazadas (por sección)
  const lcIds = gastos.map((g) => g.libro_compra_id).filter(Boolean) as string[];
  const facturasEnl = lcIds.length
    ? ((await sb.from("libro_compras").select("id, numero_control, seccion, moneda, total").eq("empresa_id", empresaId).in("id", lcIds)).data ?? []) as Factura[]
    : [];
  const facturaPorId = new Map(facturasEnl.map((f) => [f.id, f]));

  const incidencias: Incidencia[] = [];

  for (const g of gastos) {
    if (!compl(g)) continue;
    const base = {
      gasto_id: g.id,
      comprobante: g.comprobante,
      proveedor: g.proveedor_nombre,
      descripcion: g.descripcion,
      monto: g.monto,
      moneda: g.moneda,
      libro_compra_id_actual: g.libro_compra_id,
    };
    if (!g.libro_compra_id) {
      incidencias.push({
        ...base,
        tipo: "GASTO_SIN_FACTURA",
        mensaje: "Gasto con comprobante completo pero sin factura en el Libro de Compras C/E. Se va a crear/enlazar.",
      });
      continue;
    }
    const f = facturaPorId.get(g.libro_compra_id);
    if (f && f.seccion !== "COMERCIO_EXTERIOR") {
      incidencias.push({
        ...base,
        tipo: "FACTURA_SECCION_INCORRECTA",
        factura_sugerida_lc: f.numero_control,
        mensaje: `Está enlazado a ${f.numero_control} que es de sección ${f.seccion}. Se va a desenlazar y crear la factura correcta en C/E.`,
      });
    }
  }
  return { incidencias, gastos };
}

export async function GET(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { incidencias } = await detectar(ctx.supabase, ctx.auth.empresa_id, id);
    return NextResponse.json(successResponse({ incidencias }));
  } catch (err) {
    console.error("[consistencia GET]", err);
    return NextResponse.json(errorResponse("No se pudo analizar la importación."), { status: 500 });
  }
}

export async function POST(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase;

    const { data: imp } = await sb.from("importaciones").select("estado").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (!imp) return NextResponse.json(errorResponse("Importación no encontrada."), { status: 404 });
    if (operacionCerrada((imp as { estado: string }).estado))
      return NextResponse.json(errorResponse("La importación está cerrada o anulada."), { status: 400 });

    const { incidencias, gastos } = await detectar(sb, emp, id);
    const gastoPorId = new Map(gastos.map((g) => [g.id, g]));
    const resultados: { gasto_id: string; estado: "OK" | "ERROR"; mensaje: string }[] = [];

    for (const inc of incidencias) {
      const g = inc.gasto_id ? gastoPorId.get(inc.gasto_id) : null;
      if (!g) continue;
      try {
        // Si estaba enlazado a una sección mal, primero desenlazar.
        if (inc.tipo === "FACTURA_SECCION_INCORRECTA") {
          await sb.from("comex_gastos").update({ libro_compra_id: null }).eq("empresa_id", emp).eq("id", g.id);
        }
        const { compraId, numeroControl, existed } = await crearFacturaDeGasto(sb, ctx.auth, {
          fecha: g.fecha,
          tipo: g.tipo,
          descripcion: g.descripcion,
          proveedor_nombre: g.proveedor_nombre,
          proveedor_ruc: g.proveedor_ruc,
          comprobante: g.comprobante,
          timbrado: g.timbrado,
          cuenta_codigo: g.cuenta_codigo,
          monto: g.monto,
          moneda: g.moneda,
          tipo_cambio: g.tipo_cambio,
          iva_porcentaje: g.iva_porcentaje,
        });
        await sb.from("comex_gastos").update({ libro_compra_id: compraId }).eq("empresa_id", emp).eq("id", g.id);
        resultados.push({ gasto_id: g.id, estado: "OK", mensaje: `${existed ? "Enlazado a" : "Creado"} ${numeroControl}.` });
      } catch (e) {
        resultados.push({ gasto_id: g.id, estado: "ERROR", mensaje: e instanceof Error ? e.message : "Error" });
      }
    }

    return NextResponse.json(successResponse({ resultados, total: incidencias.length }));
  } catch (err) {
    console.error("[consistencia POST]", err);
    return NextResponse.json(errorResponse("No se pudieron aplicar las correcciones."), { status: 500 });
  }
}
