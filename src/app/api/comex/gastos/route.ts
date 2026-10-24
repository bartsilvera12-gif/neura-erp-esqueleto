import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, esUuid, estadoOperacion, nombreUsuario, operacionCerrada, registrarHistorial } from "@/lib/comex/server";
import { datosGasto } from "@/lib/comex/gastos";

const COLS =
  "id, origen_tipo, origen_id, fecha, tipo, descripcion, proveedor_nombre, comprobante, monto, moneda, tipo_cambio, pagado, cuenta_codigo, lleva_iva, usuario_nombre, created_at";

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
    return NextResponse.json(successResponse({ gastos: data ?? [] }));
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
    await registrarHistorial(ctx.supabase, ctx.auth, origenTipo, origenId, "CARGAR_GASTO", {
      tipo: d.datos.tipo,
      monto: d.datos.monto,
      moneda: d.datos.moneda,
    });
    return NextResponse.json(successResponse({ gasto: data }));
  } catch (err) {
    console.error("[/api/comex/gastos POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
