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

    // Conceptos adicionales de la MISMA factura (cada uno con su propio IVA):
    // comparten proveedor, comprobante, timbrado, cuenta, fecha y moneda.
    const extrasRaw = Array.isArray(b.extras) ? (b.extras as Record<string, unknown>[]) : [];
    const extras: Record<string, unknown>[] = [];
    for (const x of extrasRaw) {
      const ivaX = Number(x.iva_porcentaje);
      const de = datosGasto({
        ...b,
        tipo: x.tipo,
        descripcion: x.descripcion,
        monto: x.monto,
        lleva_iva: ivaX === 5 || ivaX === 10,
        iva_porcentaje: ivaX,
      });
      if ("error" in de) return NextResponse.json(errorResponse(de.error), { status: 400 });
      extras.push(de.datos);
    }
    const todos = [d.datos, ...extras];

    const { data: insertados, error } = await ctx.supabase
      .from("comex_gastos")
      .insert(
        todos.map((x) => ({
          ...x,
          empresa_id: ctx.auth.empresa_id,
          origen_tipo: origenTipo,
          origen_id: origenId,
          usuario_nombre: nombreUsuario(ctx.auth),
        }))
      )
      .select(COLS);
    if (error) throw new Error(error.message);
    const filas = (insertados ?? []) as Record<string, unknown>[];
    const idsInsertados = filas.map((x) => x.id as string);
    let gasto = filas[0];

    // Si lleva IVA o es exento con comprobante completo, se genera la factura
    // en el Libro de Compras y se enlaza. Las exentas con comprobante van como
    // EXENTAS al libro para que el Libro IVA refleje todos los documentos.
    const _ruc = String(d.datos.proveedor_ruc ?? "").trim();
    const _cmp = String(d.datos.comprobante ?? "").trim();
    const _tim = String(d.datos.timbrado ?? "").trim();
    const _cta = String(d.datos.cuenta_codigo ?? "").trim();
    const _cmpReal = _cmp.length >= 3 && !/^0+$/.test(_cmp.replace(/[-\s]/g, ""));
    const _vaAlLibro = todos.some((x) => x.lleva_iva) || Boolean(_ruc && _cmpReal && _tim && _cta);
    if (_vaAlLibro) {
      try {
        const { compraId } = await crearFacturaDeGasto(
          ctx.supabase,
          ctx.auth,
          todos.map((x) => ({
            fecha: String(x.fecha),
            tipo: x.tipo as string | null,
            descripcion: x.descripcion as string | null,
            proveedor_nombre: x.proveedor_nombre as string | null,
            proveedor_ruc: x.proveedor_ruc as string | null,
            comprobante: x.comprobante as string | null,
            timbrado: x.timbrado as string | null,
            cuenta_codigo: x.cuenta_codigo as string | null,
            monto: x.monto as number,
            moneda: x.moneda as string,
            tipo_cambio: x.tipo_cambio as number,
            iva_porcentaje: x.iva_porcentaje as number | null,
          }))
        );
        const upd = await ctx.supabase
          .from("comex_gastos")
          .update({ libro_compra_id: compraId })
          .eq("empresa_id", ctx.auth.empresa_id)
          .in("id", idsInsertados)
          .select(COLS);
        if (!upd.error && upd.data?.length) gasto = (upd.data as unknown as Record<string, unknown>[])[0];
      } catch (e) {
        // Se revierten los gastos para no dejarlos sin su factura.
        await ctx.supabase.from("comex_gastos").delete().eq("empresa_id", ctx.auth.empresa_id).in("id", idsInsertados);
        const msg = e instanceof ErrorValidacion ? e.message : "No se pudo crear la factura en el Libro de Compras.";
        return NextResponse.json(errorResponse(msg), { status: 400 });
      }
    }

    await registrarHistorial(ctx.supabase, ctx.auth, origenTipo, origenId, "CARGAR_GASTO", {
      tipo: todos.map((x) => x.tipo).join(" + "),
      monto: todos.reduce((s, x) => s + (x.monto as number), 0),
      moneda: d.datos.moneda,
    });
    return NextResponse.json(successResponse({ gasto }));
  } catch (err) {
    console.error("[/api/comex/gastos POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
