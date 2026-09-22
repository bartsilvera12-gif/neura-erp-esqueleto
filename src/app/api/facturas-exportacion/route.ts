import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import type { TipoFactura } from "@/lib/facturas-exportacion/config";
import type { IvaTipo } from "@/lib/facturas-exportacion/types";

export const dynamic = "force-dynamic";

const COLS =
  "id, empresa_id, tipo, establecimiento, punto_expedicion, timbrado, numero, numero_formateado, " +
  "fecha, moneda, tipo_cambio, cliente_nombre, cliente_documento, cliente_direccion, cliente_pais, " +
  "cliente_ciudad, cliente_telefono, condicion_venta, nota_remision, " +
  "subtotal, total, observaciones, estado, motivo_anulacion, anulada_at, anulada_por_nombre, " +
  "regularizacion, created_at, created_by_nombre";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function txt(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s || null;
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
    const tipo = searchParams.get("tipo");
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
    if (tipo === "EXPORTACION" || tipo === "LOCAL") query = query.eq("tipo", tipo);
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

    const tipo: TipoFactura = body.tipo === "LOCAL" ? "LOCAL" : "EXPORTACION";
    const esRegularizacion = body.regularizacion === true;
    if (esRegularizacion && !esRolAdminEmpresaOGlobal(auth.rol))
      return NextResponse.json(errorResponse("Solo un administrador puede regularizar facturas."), { status: 403 });

    const est = String(body.establecimiento ?? "").trim();
    const punto = String(body.punto_expedicion ?? "").trim();
    const cliente = String(body.cliente_nombre ?? "").trim();
    const fecha = typeof body.fecha === "string" && body.fecha ? body.fecha.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const moneda = (String(body.moneda ?? (tipo === "LOCAL" ? "PYG" : "USD")).trim().toUpperCase()) || "USD";

    if (!est || !punto)
      return NextResponse.json(errorResponse("Falta establecimiento o punto de expedición."), { status: 400 });
    if (!cliente) return NextResponse.json(errorResponse("Falta el nombre del cliente."), { status: 400 });

    // Exportación: todo exento. Local: IVA por ítem (default 10%).
    const items = (Array.isArray(body.items) ? body.items : [])
      .map((it, idx) => {
        const r = it as Record<string, unknown>;
        const cantidad = toNum(r.cantidad);
        const precio = toNum(r.precio_unitario);
        const iva: IvaTipo = tipo === "EXPORTACION" ? "EXENTA" : r.iva_tipo === "5" || r.iva_tipo === "EXENTA" ? r.iva_tipo : "10";
        return {
          producto_id: r.producto_id ? String(r.producto_id) : null,
          descripcion: String(r.descripcion ?? "").trim(),
          cantidad,
          precio_unitario: precio,
          subtotal: cantidad * precio,
          iva_tipo: iva,
          orden: idx,
        };
      })
      .filter((it) => it.descripcion && it.cantidad > 0 && it.precio_unitario >= 0);
    if (items.length === 0)
      return NextResponse.json(errorResponse("Agregá al menos un ítem con cantidad mayor a 0."), { status: 400 });

    const sum = (t: IvaTipo) => items.filter((i) => i.iva_tipo === t).reduce((a, i) => a + i.subtotal, 0);
    const exentas = sum("EXENTA");
    const grav5 = sum("5");
    const grav10 = sum("10");
    const total = exentas + grav5 + grav10;
    const dec = moneda === "PYG" ? 0 : 2;
    const round = (n: number) => Math.round(n * 10 ** dec) / 10 ** dec;
    const iva5 = round(grav5 / 21);
    const iva10 = round(grav10 / 11);

    const cfgRes = await supabase
      .from("facturas_exportacion_config")
      .select("timbrado, vigencia_desde, vigencia_hasta, rango_desde, rango_hasta, tipo")
      .eq("empresa_id", auth.empresa_id)
      .eq("establecimiento", est)
      .eq("punto_expedicion", punto)
      .eq("activo", true)
      .maybeSingle();
    if (cfgRes.error) throw new Error(cfgRes.error.message);
    const cfg = cfgRes.data as unknown as {
      timbrado: string; vigencia_desde: string; vigencia_hasta: string; rango_desde: number; rango_hasta: number;
    } | null;
    if (!cfg)
      return NextResponse.json(errorResponse(`No hay timbrado activo para ${est}-${punto}.`), { status: 400 });

    if (fecha < cfg.vigencia_desde || fecha > cfg.vigencia_hasta)
      return NextResponse.json(
        errorResponse(`La fecha ${fecha} está fuera de la vigencia del timbrado ${cfg.timbrado} (${cfg.vigencia_desde} a ${cfg.vigencia_hasta}).`),
        { status: 400 }
      );

    let numero: number;
    if (esRegularizacion) {
      const n = Math.floor(toNum(body.numero));
      if (n < cfg.rango_desde || n > cfg.rango_hasta)
        return NextResponse.json(errorResponse(`El número debe estar entre ${cfg.rango_desde} y ${cfg.rango_hasta}.`), { status: 400 });
      numero = n;
    } else {
      // La RPC valida el rango y revierte el incremento si se excede.
      const rpc = await supabase.rpc("reservar_correlativo_factura_exportacion", {
        p_empresa_id: auth.empresa_id,
        p_establecimiento: est,
        p_punto_expedicion: punto,
        p_timbrado: cfg.timbrado,
      });
      if (rpc.error) {
        console.error("[facturas-exportacion RPC]", rpc.error.message);
        const msg = /rango/i.test(rpc.error.message) ? "Se agotó el rango autorizado del timbrado." : "No se pudo reservar el número.";
        return NextResponse.json(errorResponse(msg), { status: 400 });
      }
      numero = Number(rpc.data);
    }

    const usuarioNombre = auth.nombre ?? auth.user.email ?? null;
    const ins = await supabase
      .from("facturas_exportacion")
      .insert({
        empresa_id: auth.empresa_id,
        tipo,
        establecimiento: est,
        punto_expedicion: punto,
        timbrado: cfg.timbrado,
        numero,
        fecha,
        moneda,
        tipo_cambio: toNum(body.tipo_cambio) || 1,
        cliente_nombre: cliente,
        cliente_documento: txt(body.cliente_documento),
        cliente_direccion: txt(body.cliente_direccion),
        cliente_ciudad: txt(body.cliente_ciudad),
        cliente_telefono: txt(body.cliente_telefono),
        cliente_pais: (txt(body.cliente_pais) ?? (tipo === "LOCAL" ? "PARAGUAY" : "BOLIVIA")).toUpperCase(),
        condicion_venta: body.condicion_venta === "CREDITO" ? "CREDITO" : "CONTADO",
        nota_remision: tipo === "LOCAL" ? txt(body.nota_remision) : null,
        tipo_operacion: tipo === "EXPORTACION" ? txt(body.tipo_operacion) ?? "EXPORTACIÓN" : null,
        condicion_negociacion: tipo === "EXPORTACION" ? txt(body.condicion_negociacion) : null,
        agente_transporte: tipo === "EXPORTACION" ? txt(body.agente_transporte) : null,
        barcaza: tipo === "EXPORTACION" ? txt(body.barcaza) : null,
        empresa_fletera: tipo === "EXPORTACION" ? txt(body.empresa_fletera) : null,
        conocimiento: tipo === "EXPORTACION" ? txt(body.conocimiento) : null,
        subtotal: total,
        total,
        total_exentas: exentas,
        total_gravado5: grav5,
        total_gravado10: grav10,
        iva5,
        iva10,
        observaciones: txt(body.observaciones),
        regularizacion: esRegularizacion,
        created_by: auth.user.id,
        created_by_nombre: usuarioNombre,
      })
      .select(COLS)
      .single();
    if (ins.error) {
      const msg = ins.error.message ?? "";
      if (/duplicate|unique|23505/i.test(msg))
        return NextResponse.json(errorResponse("Ese número ya está usado en ese punto y timbrado."), { status: 409 });
      console.error("[facturas-exportacion insert]", msg);
      return NextResponse.json(errorResponse("No se pudo emitir la factura."), { status: 500 });
    }
    const factura = ins.data as unknown as Record<string, unknown>;

    const itemsIns = await supabase.from("facturas_exportacion_items").insert(
      items.map((it) => ({ ...it, empresa_id: auth.empresa_id, factura_id: factura.id }))
    );
    if (itemsIns.error) {
      // Sin ítems la factura no sirve: se anula para no dejar un número fiscal a medias.
      console.error("[facturas-exportacion items]", itemsIns.error.message);
      await supabase
        .from("facturas_exportacion")
        .update({ estado: "ANULADA", motivo_anulacion: "Error al guardar ítems", anulada_at: new Date().toISOString() })
        .eq("id", factura.id as string);
      return NextResponse.json(errorResponse("No se pudieron guardar los ítems; la factura quedó anulada."), { status: 500 });
    }

    await supabase.from("facturas_exportacion_auditoria").insert({
      empresa_id: auth.empresa_id,
      factura_id: factura.id,
      accion: esRegularizacion ? "REGULARIZACION" : "EMITIR",
      detalle: { tipo, numero, punto, total, moneda },
      usuario_id: auth.user.id,
      usuario_nombre: usuarioNombre,
    });

    return NextResponse.json(successResponse({ factura }));
  } catch (err) {
    console.error("[/api/facturas-exportacion POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo emitir la factura."), { status: 500 });
  }
}
