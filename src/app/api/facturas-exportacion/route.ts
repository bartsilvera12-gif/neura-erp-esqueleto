import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { EmitirFacturaExportacionInput } from "@/lib/facturas-exportacion/types";

export const dynamic = "force-dynamic";

const COLS =
  "id, empresa_id, establecimiento, punto_expedicion, timbrado, numero, numero_formateado, " +
  "fecha, moneda, tipo_cambio, cliente_nombre, cliente_documento, cliente_direccion, cliente_pais, " +
  "subtotal, total, observaciones, estado, motivo_anulacion, anulada_at, anulada_por_nombre, " +
  "regularizacion, created_at, created_by_nombre";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeInputBase(body: Record<string, unknown>) {
  const punto = String(body.punto_expedicion ?? "").trim();
  const est = String(body.establecimiento ?? "").trim();
  const cliente = String(body.cliente_nombre ?? "").trim();
  const moneda = String(body.moneda ?? "USD").trim().toUpperCase() || "USD";
  const tipoCambio = toNum(body.tipo_cambio) || 1;
  const pais = String(body.cliente_pais ?? "BOLIVIA").trim().toUpperCase();
  const itemsRaw = Array.isArray(body.items) ? body.items : [];
  const items = itemsRaw
    .map((it, idx) => {
      const r = it as Record<string, unknown>;
      const cantidad = toNum(r.cantidad);
      const pu = toNum(r.precio_unitario);
      return {
        producto_id: r.producto_id ? String(r.producto_id) : null,
        descripcion: String(r.descripcion ?? "").trim(),
        cantidad,
        precio_unitario: pu,
        subtotal: cantidad * pu,
        orden: idx,
      };
    })
    .filter((it) => it.descripcion && it.cantidad > 0);

  const subtotal = items.reduce((acc, it) => acc + it.subtotal, 0);

  return {
    est,
    punto,
    cliente,
    moneda,
    tipoCambio,
    pais,
    items,
    subtotal,
    total: subtotal,
    fecha: typeof body.fecha === "string" && body.fecha ? body.fecha : null,
    cliente_documento: body.cliente_documento ? String(body.cliente_documento).trim() : null,
    cliente_direccion: body.cliente_direccion ? String(body.cliente_direccion).trim() : null,
    observaciones: body.observaciones ? String(body.observaciones).trim() : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const { searchParams } = new URL(request.url);
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");
    const estado = searchParams.get("estado");
    const punto = searchParams.get("punto");
    const q = searchParams.get("q");

    let query = ctx.supabase
      .from("facturas_exportacion")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false });

    if (desde) query = query.gte("fecha", desde);
    if (hasta) query = query.lte("fecha", hasta);
    if (estado === "EMITIDA" || estado === "ANULADA") query = query.eq("estado", estado);
    if (punto) query = query.eq("punto_expedicion", punto);
    if (q) query = query.ilike("cliente_nombre", `%${q}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ facturas: data ?? [] }));
  } catch (err) {
    console.error("[/api/facturas-exportacion GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las facturas."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const esRegularizacion = body.regularizacion === true || body.numero != null;
    const parsed = normalizeInputBase(body);

    if (!parsed.est || !parsed.punto)
      return NextResponse.json(errorResponse("Falta establecimiento o punto de expedición."), { status: 400 });
    if (!parsed.cliente)
      return NextResponse.json(errorResponse("Falta el nombre del cliente."), { status: 400 });
    if (parsed.items.length === 0)
      return NextResponse.json(errorResponse("Agregá al menos un item con cantidad > 0."), { status: 400 });

    // Buscar config activa para el punto (para timbrado).
    const cfgRes = await supabase
      .from("facturas_exportacion_config")
      .select("id, timbrado, activo")
      .eq("empresa_id", auth.empresa_id)
      .eq("establecimiento", parsed.est)
      .eq("punto_expedicion", parsed.punto)
      .eq("activo", true)
      .maybeSingle();
    if (cfgRes.error) throw new Error(cfgRes.error.message);
    if (!cfgRes.data)
      return NextResponse.json(
        errorResponse(`No hay configuración Autoimpresor activa para el punto ${parsed.punto}.`),
        { status: 400 }
      );
    const timbrado = String((cfgRes.data as { timbrado: string }).timbrado);

    let numero: number;
    if (esRegularizacion) {
      const n = Number(body.numero);
      if (!Number.isFinite(n) || n <= 0)
        return NextResponse.json(errorResponse("Número inválido para regularización."), { status: 400 });
      numero = Math.floor(n);
    } else {
      // Reservar correlativo atómico.
      const rpc = await supabase.rpc("reservar_correlativo_factura_exportacion", {
        p_empresa_id: auth.empresa_id,
        p_establecimiento: parsed.est,
        p_punto_expedicion: parsed.punto,
        p_timbrado: timbrado,
      });
      if (rpc.error) {
        console.error("[facturas-exportacion RPC]", rpc.error.message);
        return NextResponse.json(errorResponse("No se pudo reservar el número."), { status: 500 });
      }
      numero = Number(rpc.data);
    }

    const usuarioNombre = auth.nombre ?? auth.user.email ?? null;
    const ins = await supabase
      .from("facturas_exportacion")
      .insert({
        empresa_id: auth.empresa_id,
        establecimiento: parsed.est,
        punto_expedicion: parsed.punto,
        timbrado,
        numero,
        fecha: parsed.fecha ?? new Date().toISOString().slice(0, 10),
        moneda: parsed.moneda,
        tipo_cambio: parsed.tipoCambio,
        cliente_nombre: parsed.cliente,
        cliente_documento: parsed.cliente_documento,
        cliente_direccion: parsed.cliente_direccion,
        cliente_pais: parsed.pais,
        subtotal: parsed.subtotal,
        total: parsed.total,
        observaciones: parsed.observaciones,
        regularizacion: esRegularizacion,
        created_by: auth.user.id,
        created_by_nombre: usuarioNombre,
      })
      .select(COLS)
      .single();
    if (ins.error) {
      const msg = ins.error.message ?? "";
      if (/duplicate|unique|23505/i.test(msg))
        return NextResponse.json(errorResponse("Ese número ya está usado en ese punto/timbrado."), { status: 409 });
      console.error("[facturas-exportacion insert]", msg);
      return NextResponse.json(errorResponse("No se pudo emitir la factura."), { status: 500 });
    }
    const factura = ins.data as unknown as Record<string, unknown>;

    // Insertar items.
    const itemsIns = await supabase
      .from("facturas_exportacion_items")
      .insert(
        parsed.items.map((it) => ({
          empresa_id: auth.empresa_id,
          factura_id: factura.id,
          producto_id: it.producto_id,
          descripcion: it.descripcion,
          cantidad: it.cantidad,
          precio_unitario: it.precio_unitario,
          subtotal: it.subtotal,
          orden: it.orden,
        }))
      );
    if (itemsIns.error) console.error("[facturas-exportacion items]", itemsIns.error.message);

    // Auditoría.
    await supabase.from("facturas_exportacion_auditoria").insert({
      empresa_id: auth.empresa_id,
      factura_id: factura.id,
      accion: esRegularizacion ? "REGULARIZACION" : "EMITIR",
      detalle: { numero, punto: parsed.punto, total: parsed.total, moneda: parsed.moneda },
      usuario_id: auth.user.id,
      usuario_nombre: usuarioNombre,
    });

    return NextResponse.json(successResponse({ factura }));
  } catch (err) {
    console.error("[/api/facturas-exportacion POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo emitir la factura."), { status: 500 });
  }
}

export type { EmitirFacturaExportacionInput };
