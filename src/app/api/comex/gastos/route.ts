import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, esUuid, estadoOperacion, nombreUsuario, operacionCerrada, registrarHistorial } from "@/lib/comex/server";
import { MONEDAS_COMEX, TIPOS_GASTO_COMEX } from "@/lib/comex/gastos";

const COLS =
  "id, origen_tipo, origen_id, fecha, tipo, descripcion, proveedor_nombre, comprobante, monto, moneda, tipo_cambio, pagado, usuario_nombre, created_at";

/** Solo importación y exportación tienen gastos propios. */
const ORIGENES_GASTO = new Set(["IMPORTACION", "EXPORTACION"]);

/** Valida y normaliza el cuerpo que llega del formulario. */
function datosGasto(b: Record<string, unknown>): { datos: Record<string, unknown> } | { error: string } {
  const monto = Number(b.monto);
  if (!(monto > 0)) return { error: "El monto tiene que ser mayor a 0." };
  const moneda = String(b.moneda ?? "PYG").toUpperCase();
  if (!MONEDAS_COMEX.includes(moneda)) return { error: "Moneda no soportada." };
  const tipoCambio = moneda === "PYG" ? 1 : Number(b.tipo_cambio);
  if (!(tipoCambio > 0)) return { error: "Poné el tipo de cambio a guaraníes." };
  const tipo = String(b.tipo ?? "").trim();
  if (!TIPOS_GASTO_COMEX.includes(tipo)) return { error: "Elegí un tipo de gasto." };
  const texto = (v: unknown, max: number) => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, max) : null;
  };
  return {
    datos: {
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha ?? "")) ? String(b.fecha) : new Date().toISOString().slice(0, 10),
      tipo,
      descripcion: texto(b.descripcion, 300),
      proveedor_nombre: texto(b.proveedor_nombre, 200),
      comprobante: texto(b.comprobante, 60),
      monto,
      moneda,
      tipo_cambio: tipoCambio,
      pagado: b.pagado === true,
    },
  };
}

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
