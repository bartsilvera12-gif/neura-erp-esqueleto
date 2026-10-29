import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, estadoOperacion, operacionCerrada, registrarHistorial } from "@/lib/comex/server";
import { datosGasto } from "@/lib/comex/gastos";
import { actualizarFacturaDeGasto, anularFacturaDeGasto, crearFacturaDeGasto, type GastoParaFactura } from "@/lib/comex/gasto-factura";
import { ErrorValidacion } from "@/lib/compras-libro/server";

const COLS = "id, origen_tipo, origen_id, tipo, monto, moneda, pagado, lleva_iva, libro_compra_id";

type Gasto = {
  origen_tipo: "IMPORTACION" | "EXPORTACION";
  origen_id: string;
  tipo: string;
  monto: number;
  moneda: string;
  pagado: boolean;
  lleva_iva: boolean;
  libro_compra_id: string | null;
};

/** Datos del gasto (ya validados) listos para armar/actualizar su factura. */
function gastoParaFactura(datos: Record<string, unknown>): GastoParaFactura {
  return {
    fecha: String(datos.fecha),
    tipo: datos.tipo as string | null,
    descripcion: datos.descripcion as string | null,
    proveedor_nombre: datos.proveedor_nombre as string | null,
    proveedor_ruc: datos.proveedor_ruc as string | null,
    comprobante: datos.comprobante as string | null,
    timbrado: datos.timbrado as string | null,
    cuenta_codigo: datos.cuenta_codigo as string | null,
    monto: datos.monto as number,
    moneda: datos.moneda as string,
    tipo_cambio: datos.tipo_cambio as number,
    iva_porcentaje: datos.iva_porcentaje as number | null,
  };
}

type ComexCtx = NonNullable<Awaited<ReturnType<typeof getComexCtx>>>;
type Editable = { ok: true; ctx: ComexCtx; gasto: Gasto } | { ok: false; status: number; error: string };

/** El gasto, si es de la empresa y su operación sigue abierta. */
async function gastoEditable(request: NextRequest, id: string): Promise<Editable> {
  const ctx = await getComexCtx(request);
  if (!ctx) return { ok: false, status: 401, error: API_ERRORS.UNAUTHORIZED };
  const { data } = await ctx.supabase.from("comex_gastos").select(COLS).eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle();
  const gasto = data as unknown as Gasto | null;
  if (!gasto) return { ok: false, status: 404, error: "Gasto no encontrado." };
  const estado = await estadoOperacion(ctx.supabase, ctx.auth.empresa_id, gasto.origen_tipo, gasto.origen_id);
  if (!estado || operacionCerrada(estado)) return { ok: false, status: 400, error: "La operación está cerrada o anulada." };
  return { ok: true, ctx, gasto };
}

/** PATCH — edita el gasto completo (si viene `monto`) o solo marca pagado/pendiente. */
export async function PATCH(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const r = await gastoEditable(request, id);
    if (!r.ok) return NextResponse.json(errorResponse(r.error), { status: r.status });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    // Edición completa del gasto (el formulario manda todos los campos, incluido el monto).
    if (b.monto !== undefined) {
      const d = datosGasto(b);
      if ("error" in d) return NextResponse.json(errorResponse(d.error), { status: 400 });
      const sb = r.ctx.supabase;
      const emp = r.ctx.auth.empresa_id;
      const facturaId = r.gasto.libro_compra_id;
      const ahoraIva = d.datos.lleva_iva === true;

      // Se sincroniza la factura ANTES de tocar el gasto: si algo falla (ej.: la
      // cuota ya tiene pagos), el gasto no queda a medias.
      let nuevaFacturaId = facturaId;
      try {
        const g = gastoParaFactura(d.datos);
        if (ahoraIva && facturaId) {
          await actualizarFacturaDeGasto(sb, r.ctx.auth, facturaId, g);
        } else if (ahoraIva && !facturaId) {
          nuevaFacturaId = (await crearFacturaDeGasto(sb, r.ctx.auth, g)).compraId;
        } else if (!ahoraIva && facturaId) {
          await anularFacturaDeGasto(sb, r.ctx.auth, facturaId, "El gasto dejó de llevar IVA");
          nuevaFacturaId = null;
        }
      } catch (e) {
        const msg = e instanceof ErrorValidacion ? e.message : "No se pudo actualizar la factura del Libro de Compras.";
        return NextResponse.json(errorResponse(msg), { status: 400 });
      }

      const { error } = await sb
        .from("comex_gastos")
        .update({ ...d.datos, libro_compra_id: nuevaFacturaId, updated_at: new Date().toISOString() })
        .eq("empresa_id", emp)
        .eq("id", id);
      if (error) throw new Error(error.message);
      await registrarHistorial(sb, r.ctx.auth, r.gasto.origen_tipo, r.gasto.origen_id, "EDITAR_GASTO", {
        tipo: d.datos.tipo,
        monto: d.datos.monto,
        moneda: d.datos.moneda,
      });
      return NextResponse.json(successResponse({ id }));
    }

    // Solo marcar pagado / pendiente.
    if (typeof b.pagado !== "boolean") return NextResponse.json(errorResponse("Nada que cambiar."), { status: 400 });
    const { error } = await r.ctx.supabase
      .from("comex_gastos")
      .update({ pagado: b.pagado, updated_at: new Date().toISOString() })
      .eq("empresa_id", r.ctx.auth.empresa_id)
      .eq("id", id);
    if (error) throw new Error(error.message);
    await registrarHistorial(r.ctx.supabase, r.ctx.auth, r.gasto.origen_tipo, r.gasto.origen_id, "GASTO_PAGADO", {
      tipo: r.gasto.tipo,
      monto: r.gasto.monto,
      pagado: b.pagado,
    });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/comex/gastos/:id PATCH]", err);
    return NextResponse.json(errorResponse("No se pudo actualizar el gasto."), { status: 500 });
  }
}

/** DELETE — quita el gasto (queda en el historial de la operación). */
export async function DELETE(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const r = await gastoEditable(request, id);
    if (!r.ok) return NextResponse.json(errorResponse(r.error), { status: r.status });
    // Si tenía factura en el Libro de Compras, se anula (devuelve los pagos a la caja / banco).
    if (r.gasto.libro_compra_id) {
      try {
        await anularFacturaDeGasto(r.ctx.supabase, r.ctx.auth, r.gasto.libro_compra_id, "Se quitó el gasto de la importación");
      } catch (e) {
        const msg = e instanceof ErrorValidacion ? e.message : "No se pudo anular la factura del Libro de Compras.";
        return NextResponse.json(errorResponse(msg), { status: 400 });
      }
    }
    const { error } = await r.ctx.supabase.from("comex_gastos").delete().eq("empresa_id", r.ctx.auth.empresa_id).eq("id", id);
    if (error) throw new Error(error.message);
    await registrarHistorial(r.ctx.supabase, r.ctx.auth, r.gasto.origen_tipo, r.gasto.origen_id, "QUITAR_GASTO", {
      tipo: r.gasto.tipo,
      monto: r.gasto.monto,
      moneda: r.gasto.moneda,
    });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/comex/gastos/:id DELETE]", err);
    return NextResponse.json(errorResponse("No se pudo quitar el gasto."), { status: 500 });
  }
}
