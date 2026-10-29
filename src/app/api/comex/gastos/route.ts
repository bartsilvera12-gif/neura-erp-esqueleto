import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, esUuid, estadoOperacion, nombreUsuario, operacionCerrada, registrarHistorial } from "@/lib/comex/server";
import { datosGasto } from "@/lib/comex/gastos";
import { crearFacturaDeGasto } from "@/lib/comex/gasto-factura";
import { ErrorValidacion } from "@/lib/compras-libro/server";

const COLS =
  "id, origen_tipo, origen_id, fecha, tipo, descripcion, proveedor_nombre, proveedor_ruc, comprobante, timbrado, monto, moneda, tipo_cambio, pagado, cuenta_codigo, lleva_iva, iva_porcentaje, libro_compra_id, usuario_nombre, created_at";

/** Solo importación y exportación tienen gastos propios. */
const ORIGENES_GASTO = new Set(["IMPORTACION", "EXPORTACION"]);

/** GET ?origen_tipo=&origen_id= — los gastos de una operación, lo último arriba. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sp = new URL(request.url).searchParams;
    const origenTipo = String(sp.get("origen_tipo") ?? "");
    const origenId = String(sp.get("origen_id") ?? "");
    if (!ORIGENES_GASTO.has(origenTipo) || !esUuid(origenId))
      return NextResponse.json(errorResponse("Falta la operación."), { status: 400 });
    const { data, error } = await ctx.supabase
      .from("comex_gastos")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("origen_tipo", origenTipo)
      .eq("origen_id", origenId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const gastos = (data ?? []) as Record<string, unknown>[];

    // Estado de pago de la factura (Libro de Compras) de los gastos con IVA.
    const ids = gastos.map((g) => g.libro_compra_id).filter(Boolean) as string[];
    if (ids.length) {
      const emp = ctx.auth.empresa_id;
      const [cuotas, compras] = await Promise.all([
        ctx.supabase.from("libro_compras_cuotas").select("compra_id, monto, pagado").eq("empresa_id", emp).in("compra_id", ids),
        ctx.supabase.from("libro_compras").select("id, estado, numero_control").eq("empresa_id", emp).in("id", ids),
      ]);
      const saldoPorCompra = new Map<string, { total: number; pagado: number }>();
      for (const c of (cuotas.data ?? []) as { compra_id: string; monto: number; pagado: number }[]) {
        const prev = saldoPorCompra.get(c.compra_id) ?? { total: 0, pagado: 0 };
        saldoPorCompra.set(c.compra_id, { total: prev.total + Number(c.monto), pagado: prev.pagado + Number(c.pagado) });
      }
      const compraById = new Map<string, { estado: string; numero_control: string }>();
      for (const c of (compras.data ?? []) as { id: string; estado: string; numero_control: string }[]) compraById.set(c.id, c);
      for (const g of gastos) {
        const cid = g.libro_compra_id as string | null;
        if (!cid) continue;
        const s = saldoPorCompra.get(cid);
        const c = compraById.get(cid);
        g.factura = c
          ? {
              numero_control: c.numero_control,
              estado: c.estado,
              total: s?.total ?? 0,
              pagado: s?.pagado ?? 0,
              saldo: Math.max(0, (s?.total ?? 0) - (s?.pagado ?? 0)),
            }
          : null;
      }
    }
    return NextResponse.json(successResponse({ gastos }));
  } catch (err) {
    console.error("[/api/comex/gastos GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar los gastos."), { status: 500 });
  }
}

/** POST — agrega un gasto a la operación. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const origenTipo = String(b.origen_tipo ?? "") as "IMPORTACION" | "EXPORTACION";
    const origenId = String(b.origen_id ?? "");
    if (!ORIGENES_GASTO.has(origenTipo) || !esUuid(origenId))
      return NextResponse.json(errorResponse("Falta la operación."), { status: 400 });
    const estado = await estadoOperacion(ctx.supabase, ctx.auth.empresa_id, origenTipo, origenId);
    if (!estado) return NextResponse.json(errorResponse("Operación no encontrada."), { status: 404 });
    if (operacionCerrada(estado)) return NextResponse.json(errorResponse("La operación está cerrada o anulada."), { status: 400 });

    const d = datosGasto(b);
    if ("error" in d) return NextResponse.json(errorResponse(d.error), { status: 400 });

    const { data, error } = await ctx.supabase
      .from("comex_gastos")
      .insert({
        ...d.datos,
        empresa_id: ctx.auth.empresa_id,
        origen_tipo: origenTipo,
        origen_id: origenId,
        usuario_nombre: nombreUsuario(ctx.auth),
      })
      .select(COLS)
      .single();
    if (error) throw new Error(error.message);
    let gasto = data as Record<string, unknown>;

    // Si lleva IVA, se genera la factura en el Libro de Compras y se enlaza.
    if (d.datos.lleva_iva) {
      try {
        const { compraId } = await crearFacturaDeGasto(ctx.supabase, ctx.auth, {
          fecha: String(d.datos.fecha),
          tipo: d.datos.tipo as string | null,
          descripcion: d.datos.descripcion as string | null,
          proveedor_nombre: d.datos.proveedor_nombre as string | null,
          proveedor_ruc: d.datos.proveedor_ruc as string | null,
          comprobante: d.datos.comprobante as string | null,
          timbrado: d.datos.timbrado as string | null,
          cuenta_codigo: d.datos.cuenta_codigo as string | null,
          monto: d.datos.monto as number,
          moneda: d.datos.moneda as string,
          tipo_cambio: d.datos.tipo_cambio as number,
          iva_porcentaje: d.datos.iva_porcentaje as number | null,
        });
        const upd = await ctx.supabase
          .from("comex_gastos")
          .update({ libro_compra_id: compraId })
          .eq("empresa_id", ctx.auth.empresa_id)
          .eq("id", (gasto as { id: string }).id)
          .select(COLS)
          .single();
        if (!upd.error && upd.data) gasto = upd.data as Record<string, unknown>;
      } catch (e) {
        // Se revierte el gasto para no dejarlo sin su factura.
        await ctx.supabase.from("comex_gastos").delete().eq("empresa_id", ctx.auth.empresa_id).eq("id", (gasto as { id: string }).id);
        const msg = e instanceof ErrorValidacion ? e.message : "No se pudo crear la factura en el Libro de Compras.";
        return NextResponse.json(errorResponse(msg), { status: 400 });
      }
    }

    await registrarHistorial(ctx.supabase, ctx.auth, origenTipo, origenId, "CARGAR_GASTO", {
      tipo: d.datos.tipo,
      monto: d.datos.monto,
      moneda: d.datos.moneda,
    });
    return NextResponse.json(successResponse({ gasto }));
  } catch (err) {
    console.error("[/api/comex/gastos POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
