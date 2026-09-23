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
  "prueba, regularizacion_id, total_pyg, total_descuento, cliente_id, emitida_at, created_at, created_by_nombre";

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
    const modo = searchParams.get("modo");

    let query = ctx.supabase
      .from("facturas_exportacion")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false });

    if (desde) query = query.gte("fecha", desde);
    if (hasta) query = query.lte("fecha", hasta);
    if (estado === "EMITIDA" || estado === "ANULADA" || estado === "BORRADOR") query = query.eq("estado", estado);
    if (tipo === "EXPORTACION" || tipo === "LOCAL") query = query.eq("tipo", tipo);
    if (punto) query = query.eq("punto_expedicion", punto);
    if (q) {
      // Busca por cliente o por número; se quitan caracteres que rompen el filtro de PostgREST.
      const t = q.replace(/[,()*%\\]/g, " ").trim();
      if (t) query = query.or(`cliente_nombre.ilike.*${t}*,numero_formateado.ilike.*${t}*`);
    }
    if (modo === "prueba") query = query.eq("prueba", true);
    if (modo === "real") query = query.eq("prueba", false);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ facturas: data ?? [] }));
  } catch (err) {
    console.error("[/api/facturas-exportacion GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las facturas."), { status: 500 });
  }
}

/**
 * POST — guarda un borrador o emite una factura.
 * body.accion: "borrador" (sin número, validación mínima) | "emitir" (default).
 * body.id: si viene, continúa ese borrador en vez de crear otra factura.
 */
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

    const esBorrador = body.accion === "borrador";
    const borradorId = txt(body.id);
    const tipo: TipoFactura = body.tipo === "LOCAL" ? "LOCAL" : "EXPORTACION";
    const bad = (msg: string, status = 400) => NextResponse.json(errorResponse(msg), { status });

    // Reemisión de una factura de agosto: acción explícita, solo admin.
    const regularizacionId = txt(body.regularizacion_id);
    if (regularizacionId && !esRolAdminEmpresaOGlobal(auth.rol))
      return bad("Solo un administrador puede reemitir facturas regularizadas.", 403);

    if (borradorId) {
      const prev = await supabase
        .from("facturas_exportacion")
        .select("estado")
        .eq("empresa_id", auth.empresa_id)
        .eq("id", borradorId)
        .maybeSingle();
      if (prev.error) throw new Error(prev.error.message);
      const estadoPrev = (prev.data as { estado?: string } | null)?.estado;
      if (!estadoPrev) return bad("El borrador no existe.", 404);
      if (estadoPrev !== "BORRADOR") return bad("Esa factura ya fue emitida; no se puede modificar.");
    }

    const est = String(body.establecimiento ?? "").trim();
    const punto = String(body.punto_expedicion ?? "").trim();
    const cliente = String(body.cliente_nombre ?? "").trim();
    const pais = txt(body.cliente_pais);
    const fecha = typeof body.fecha === "string" && body.fecha ? body.fecha.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const moneda = (String(body.moneda ?? (tipo === "LOCAL" ? "PYG" : "USD")).trim().toUpperCase()) || "USD";
    const tipoCambio = moneda === "PYG" ? 1 : toNum(body.tipo_cambio);
    const dec = moneda === "PYG" ? 0 : 2;
    const round = (n: number) => Math.round(n * 10 ** dec) / 10 ** dec;

    // Exportación: todo exento. Local: IVA por ítem (default 10%). El descuento se resta del ítem.
    const items = (Array.isArray(body.items) ? body.items : [])
      .map((it, idx) => {
        const r = it as Record<string, unknown>;
        const cantidad = toNum(r.cantidad);
        const precio = toNum(r.precio_unitario);
        const descuento = Math.max(0, toNum(r.descuento));
        const iva: IvaTipo = tipo === "EXPORTACION" ? "EXENTA" : r.iva_tipo === "5" || r.iva_tipo === "EXENTA" ? r.iva_tipo : "10";
        return {
          producto_id: r.producto_id ? String(r.producto_id) : null,
          codigo: txt(r.codigo),
          descripcion: String(r.descripcion ?? "").trim(),
          unidad: txt(r.unidad),
          cantidad,
          precio_unitario: precio,
          descuento: round(descuento),
          subtotal: round(cantidad * precio - descuento),
          iva_tipo: iva,
          orden: idx,
        };
      })
      .filter((it) => it.descripcion);

    const sum = (t: IvaTipo) => items.filter((i) => i.iva_tipo === t).reduce((a, i) => a + i.subtotal, 0);
    const exentas = round(sum("EXENTA"));
    const grav5 = round(sum("5"));
    const grav10 = round(sum("10"));
    const total = round(exentas + grav5 + grav10);
    const totalDescuento = round(items.reduce((a, i) => a + i.descuento, 0));

    if (!est || !punto) return bad("Elegí el punto de expedición.");

    if (!esBorrador) {
      // Validaciones obligatorias (QA-12, QA-13, QA-14).
      if (!cliente) return bad("Falta el nombre o razón social del cliente.");
      if (!pais) return bad("Falta el país del cliente.");
      if (items.length === 0) return bad("Agregá al menos un producto.");
      const malo = items.find((i) => !(i.cantidad > 0) || !(i.precio_unitario > 0));
      if (malo) return bad(`"${malo.descripcion}": la cantidad y el precio tienen que ser mayores a 0.`);
      const descMalo = items.find((i) => i.subtotal <= 0);
      if (descMalo) return bad(`"${descMalo.descripcion}": el descuento no puede ser igual o mayor al importe.`);
      if (!(total > 0)) return bad("El total de la factura tiene que ser mayor a 0.");
      if (moneda !== "PYG" && !(tipoCambio > 1))
        return bad(`Para facturar en ${moneda} cargá el tipo de cambio a guaraníes del día.`);
    }

    const cfgRes = await supabase
      .from("facturas_exportacion_config")
      .select("timbrado, vigencia_desde, vigencia_hasta, rango_desde, rango_hasta, modo_prueba")
      .eq("empresa_id", auth.empresa_id)
      .eq("establecimiento", est)
      .eq("punto_expedicion", punto)
      .eq("activo", true)
      .maybeSingle();
    if (cfgRes.error) throw new Error(cfgRes.error.message);
    const cfg = cfgRes.data as unknown as {
      timbrado: string; vigencia_desde: string; vigencia_hasta: string; rango_desde: number; rango_hasta: number; modo_prueba: boolean;
    } | null;
    if (!cfg) return bad(`No hay timbrado activo para ${est}-${punto}.`);

    if (!esBorrador && (fecha < cfg.vigencia_desde || fecha > cfg.vigencia_hasta))
      return bad(`La fecha ${fecha} está fuera de la vigencia del timbrado ${cfg.timbrado} (${cfg.vigencia_desde} a ${cfg.vigencia_hasta}).`);

    const prueba = cfg.modo_prueba !== false;

    if (regularizacionId) {
      const reg = await supabase
        .from("facturas_regularizacion")
        .select("id, estado")
        .eq("empresa_id", auth.empresa_id)
        .eq("id", regularizacionId)
        .maybeSingle();
      if (reg.error) throw new Error(reg.error.message);
      const estadoReg = (reg.data as { estado?: string } | null)?.estado;
      if (!estadoReg) return bad("La factura a regularizar no existe.", 404);
      if (estadoReg === "REEMITIDA") return bad("Esa factura de agosto ya fue reemitida.");
    }

    // El número se asigna solo al emitir. La RPC valida el rango y revierte si se excede; en prueba usa otro contador.
    let numero: number | null = null;
    if (!esBorrador) {
      const rpc = await supabase.rpc("reservar_correlativo_factura_exportacion", {
        p_empresa_id: auth.empresa_id,
        p_establecimiento: est,
        p_punto_expedicion: punto,
        p_timbrado: cfg.timbrado,
        p_prueba: prueba,
      });
      if (rpc.error) {
        console.error("[facturas-exportacion RPC]", rpc.error.message);
        return bad(/rango/i.test(rpc.error.message)
          ? "Se agotó el rango autorizado del timbrado (5000). No se pueden emitir más facturas en este punto."
          : "No se pudo reservar el número.");
      }
      numero = Number(rpc.data);
    }

    const usuarioNombre = auth.nombre ?? auth.user.email ?? null;
    const ahora = new Date().toISOString();
    const datos: Record<string, unknown> = {
      tipo,
      establecimiento: est,
      punto_expedicion: punto,
      timbrado: cfg.timbrado,
      numero,
      estado: esBorrador ? "BORRADOR" : "EMITIDA",
      fecha,
      moneda,
      tipo_cambio: tipoCambio || 1,
      cliente_id: txt(body.cliente_id),
      cliente_nombre: cliente || "(sin cliente)",
      cliente_documento: txt(body.cliente_documento),
      cliente_direccion: txt(body.cliente_direccion),
      cliente_ciudad: txt(body.cliente_ciudad),
      cliente_telefono: txt(body.cliente_telefono),
      cliente_email: txt(body.cliente_email),
      cliente_pais: (pais ?? (tipo === "LOCAL" ? "PARAGUAY" : "")).toUpperCase(),
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
      total_descuento: totalDescuento,
      total_pyg: moneda === "PYG" ? total : Math.round(total * (tipoCambio || 0)) || null,
      total_exentas: exentas,
      total_gravado5: grav5,
      total_gravado10: grav10,
      iva5: round(grav5 / 21),
      iva10: round(grav10 / 11),
      observaciones: txt(body.observaciones),
      prueba,
      regularizacion_id: regularizacionId,
      emitida_at: esBorrador ? null : ahora,
      updated_at: ahora,
      updated_by_nombre: usuarioNombre,
    };

    const res = borradorId
      ? await supabase
          .from("facturas_exportacion")
          .update(datos)
          .eq("empresa_id", auth.empresa_id)
          .eq("id", borradorId)
          .eq("estado", "BORRADOR")
          .select(COLS)
          .single()
      : await supabase
          .from("facturas_exportacion")
          .insert({ ...datos, empresa_id: auth.empresa_id, created_by: auth.user.id, created_by_nombre: usuarioNombre })
          .select(COLS)
          .single();
    if (res.error) {
      const msg = res.error.message ?? "";
      console.error("[facturas-exportacion guardar]", msg);
      // Política del spec 4.3: si el número ya se reservó y la factura no se pudo guardar,
      // el número queda consumido y se deja registrado (nunca un hueco silencioso).
      if (numero != null) {
        await supabase.from("facturas_exportacion_auditoria").insert({
          empresa_id: auth.empresa_id,
          accion: "NUMERO_CONSUMIDO_SIN_FACTURA",
          detalle: {
            numero: `${est}-${punto}-${String(numero).padStart(7, "0")}`,
            timbrado: cfg.timbrado,
            prueba,
            error: msg.slice(0, 300),
          },
          usuario_id: auth.user.id,
          usuario_nombre: usuarioNombre,
        });
      }
      if (/duplicate|unique|23505/i.test(msg)) return bad("Ese número ya está usado en ese punto y timbrado.", 409);
      return bad(
        numero != null
          ? `No se pudo guardar la factura. El número ${est}-${punto}-${String(numero).padStart(7, "0")} quedó registrado como consumido en el Historial.`
          : "No se pudo guardar la factura.",
        500
      );
    }
    const factura = res.data as unknown as Record<string, unknown>;

    // Los ítems se reemplazan completos (en un borrador pueden haber cambiado).
    await supabase.from("facturas_exportacion_items").delete().eq("empresa_id", auth.empresa_id).eq("factura_id", factura.id as string);
    if (items.length) {
      const itemsIns = await supabase
        .from("facturas_exportacion_items")
        .insert(items.map((it) => ({ ...it, empresa_id: auth.empresa_id, factura_id: factura.id })));
      if (itemsIns.error) {
        console.error("[facturas-exportacion items]", itemsIns.error.message);
        if (!esBorrador) {
          // Sin ítems la factura no sirve: se anula para no dejar un número fiscal a medias.
          await supabase
            .from("facturas_exportacion")
            .update({ estado: "ANULADA", motivo_anulacion: "Error al guardar ítems", anulada_at: ahora })
            .eq("id", factura.id as string);
          return bad("No se pudieron guardar los productos; la factura quedó anulada.", 500);
        }
        return bad("No se pudieron guardar los productos del borrador.", 500);
      }
    }

    // El guardado automático de un borrador ya creado no se audita (sería una fila cada 30 s).
    const autoSinAuditar = esBorrador && borradorId && body.auto === true;
    if (!autoSinAuditar) await supabase.from("facturas_exportacion_auditoria").insert({
      empresa_id: auth.empresa_id,
      factura_id: factura.id,
      accion: esBorrador ? (borradorId ? "BORRADOR_MODIFICAR" : "BORRADOR_CREAR") : regularizacionId ? "REEMITIR" : "EMITIR",
      detalle: { tipo, numero, punto, total, moneda, prueba, regularizacion_id: regularizacionId },
      usuario_id: auth.user.id,
      usuario_nombre: usuarioNombre,
    });

    // Una reemisión de prueba no cierra la factura de agosto: solo la real la marca REEMITIDA.
    if (!esBorrador && regularizacionId && !prueba) {
      await supabase
        .from("facturas_regularizacion")
        .update({ estado: "REEMITIDA", factura_vinculada_id: factura.id, updated_at: ahora })
        .eq("empresa_id", auth.empresa_id)
        .eq("id", regularizacionId);
    }

    return NextResponse.json(successResponse({ factura }));
  } catch (err) {
    console.error("[/api/facturas-exportacion POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo guardar la factura."), { status: 500 });
  }
}
