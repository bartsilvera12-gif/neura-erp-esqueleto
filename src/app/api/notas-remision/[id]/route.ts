import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth, getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { asegurarStockPorDeposito, filasStockDeposito, sumarStockDeposito } from "@/lib/comex/stock-deposito";
import { esInstanciaLR } from "@/lib/inventario/campos-lr";

const COLS =
  "id, empresa_id, numero, fecha, emisor, ubicacion_origen_id, ubicacion_destino_id, motivo, estado, motivo_rechazo, aprobada_at, aprobada_por, transportista, ruc_transportista, conductor, ci_conductor, chapa, fecha_inicio_traslado, fecha_fin_traslado, observaciones, created_at, updated_at, destino_tipo, cliente_id, destino_nombre, destino_direccion, destino_ciudad, timbrado, marca_vehiculo, documento_origen, prueba";

/** GET /api/notas-remision/[id] — detalle con items + nombres de ubicación. */
export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;

    const nrQ = await supabase
      .from("notas_remision")
      .select(COLS)
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (nrQ.error) throw new Error(nrQ.error.message);
    if (!nrQ.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const nr = nrQ.data as Record<string, unknown>;

    const [itemsQ, ubQ] = await Promise.all([
      supabase
        .from("notas_remision_items")
        .select("producto_id, cantidad")
        .eq("nota_remision_id", id),
      supabase
        .from("inventario_ubicaciones")
        .select("id, nombre, codigo")
        .eq("empresa_id", auth.empresa_id)
        // Una remisión a un cliente no tiene depósito de destino: ese id va vacío
        // y no se puede mandar a la consulta.
        .in("id", [nr.ubicacion_origen_id, nr.ubicacion_destino_id].filter(Boolean) as string[]),
    ]);
    if (itemsQ.error) throw new Error(itemsQ.error.message);
    if (ubQ.error) throw new Error(ubQ.error.message);
    const items = (itemsQ.data ?? []) as Array<{ producto_id: string; cantidad: number }>;
    const ubMap = new Map<string, { nombre: string; codigo: string }>();
    for (const u of (ubQ.data ?? []) as Array<{ id: string; nombre: string; codigo: string }>) {
      ubMap.set(u.id, { nombre: u.nombre, codigo: u.codigo });
    }

    // Nombres de productos para mostrar en el detalle
    const prodIds = Array.from(new Set(items.map((i) => i.producto_id)));
    const prodMap = new Map<string, { nombre: string; sku: string; unidad: string }>();
    if (prodIds.length > 0) {
      const pQ = await supabase
        .from("productos")
        .select("id, nombre, sku, unidad_medida")
        .eq("empresa_id", auth.empresa_id)
        .in("id", prodIds);
      if (pQ.error) throw new Error(pQ.error.message);
      for (const p of (pQ.data ?? []) as Array<{ id: string; nombre: string; sku: string | null; unidad_medida: string | null }>) {
        prodMap.set(p.id, { nombre: p.nombre, sku: p.sku ?? "", unidad: p.unidad_medida ?? "" });
      }
    }

    const detalleItems = items.map((i) => ({
      producto_id: i.producto_id,
      producto_nombre: prodMap.get(i.producto_id)?.nombre ?? "?",
      producto_sku: prodMap.get(i.producto_id)?.sku ?? "",
      unidad: prodMap.get(i.producto_id)?.unidad ?? "",
      cantidad: Number(i.cantidad),
    }));

    // RUC / C.I. del destinatario cuando el destino es un cliente.
    let clienteDocumento: string | null = null;
    if (nr.cliente_id) {
      const cQ = await supabase.from("clientes").select("*").eq("empresa_id", auth.empresa_id).eq("id", nr.cliente_id as string).maybeSingle();
      const c = (cQ.data ?? null) as Record<string, unknown> | null;
      clienteDocumento = c ? String(c.ruc ?? c.documento ?? c.ci ?? "").trim() || null : null;
    }

    return NextResponse.json(successResponse({
      nota_remision: {
        ...nr,
        cliente_documento: clienteDocumento,
        origen: ubMap.get(nr.ubicacion_origen_id as string) ?? null,
        destino: ubMap.get(nr.ubicacion_destino_id as string) ?? null,
        items: detalleItems,
      },
    }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

type ItemIn = { producto_id: string; cantidad: number };

/** Texto limpio o null (para los campos opcionales). */
const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * PUT /api/notas-remision/[id] — edita la nota (solo admin). Mantiene número y timbrado.
 * Si la nota está aprobada (y no es de prueba) ajusta el stock según la diferencia.
 * Registra quién editó, cuándo y qué cambió en notas_remision_auditoria.
 */
export async function PUT(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) {
      return NextResponse.json(errorResponse("Solo un administrador puede editar notas de remisión."), { status: 403 });
    }
    const { supabase, auth } = ctx;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const nrQ = await supabase.from("notas_remision").select(COLS).eq("empresa_id", auth.empresa_id).eq("id", id).maybeSingle();
    if (nrQ.error) throw new Error(nrQ.error.message);
    if (!nrQ.data) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const antes = nrQ.data as Record<string, unknown>;
    if (antes.estado === "rechazada") {
      return NextResponse.json(errorResponse("Una nota rechazada no se puede editar."), { status: 409 });
    }

    const origenId = String(b.ubicacion_origen_id ?? "").trim();
    if (!origenId) return NextResponse.json(errorResponse("Depósito de origen obligatorio."), { status: 400 });
    const destinoTipo = String(b.destino_tipo ?? "deposito") === "cliente" ? "cliente" : "deposito";
    const destinoId = String(b.ubicacion_destino_id ?? "").trim();
    const clienteId = String(b.cliente_id ?? "").trim();
    const destinoNombre = String(b.destino_nombre ?? "").trim();
    if (destinoTipo === "deposito") {
      if (!destinoId) return NextResponse.json(errorResponse("Depósito de destino obligatorio."), { status: 400 });
      if (origenId === destinoId) return NextResponse.json(errorResponse("Origen y destino no pueden ser iguales."), { status: 400 });
    } else if (!clienteId && !destinoNombre) {
      return NextResponse.json(errorResponse("Indicá el cliente o el nombre de destino del envío."), { status: 400 });
    }
    const motivo = ["traslado", "venta", "devolucion"].includes(String(b.motivo)) ? String(b.motivo) : "traslado";
    const itemsRaw = Array.isArray(b.items) ? (b.items as ItemIn[]) : [];
    const cant = new Map<string, number>();
    for (const i of itemsRaw) {
      if (i && i.producto_id && Number(i.cantidad) > 0) cant.set(i.producto_id, (cant.get(i.producto_id) ?? 0) + Number(i.cantidad));
    }
    if (cant.size === 0) return NextResponse.json(errorResponse("Cargá al menos 1 producto con cantidad > 0."), { status: 400 });
    const itemsNuevos = Array.from(cant, ([producto_id, cantidad]) => ({ producto_id, cantidad }));

    const ubIds = destinoTipo === "deposito" ? [origenId, destinoId] : [origenId];
    const ubQ = await supabase.from("inventario_ubicaciones").select("id").eq("empresa_id", auth.empresa_id).in("id", ubIds);
    if (ubQ.error) throw new Error(ubQ.error.message);
    if ((ubQ.data ?? []).length !== ubIds.length) return NextResponse.json(errorResponse("Ubicación inválida."), { status: 400 });

    const fechaEmision = txt(b.fecha);
    const cambios: Record<string, unknown> = {
      fecha: fechaEmision ?? antes.fecha,
      emisor: txt(b.emisor),
      ubicacion_origen_id: origenId,
      ubicacion_destino_id: destinoTipo === "deposito" ? destinoId : null,
      destino_tipo: destinoTipo,
      cliente_id: destinoTipo === "cliente" && clienteId ? clienteId : null,
      destino_nombre: destinoTipo === "cliente" ? destinoNombre || null : null,
      destino_direccion: destinoTipo === "cliente" ? txt(b.destino_direccion) : null,
      destino_ciudad: destinoTipo === "cliente" ? txt(b.destino_ciudad) : null,
      motivo,
      transportista: txt(b.transportista),
      ruc_transportista: txt(b.ruc_transportista),
      conductor: txt(b.conductor),
      ci_conductor: txt(b.ci_conductor),
      chapa: txt(b.chapa),
      marca_vehiculo: txt(b.marca_vehiculo),
      documento_origen: txt(b.documento_origen)?.slice(0, 120) ?? null,
      fecha_inicio_traslado: txt(b.fecha_inicio_traslado),
      fecha_fin_traslado: txt(b.fecha_fin_traslado),
      observaciones: txt(b.observaciones),
    };

    const itQ = await supabase.from("notas_remision_items").select("producto_id, cantidad").eq("nota_remision_id", id);
    if (itQ.error) throw new Error(itQ.error.message);
    const itemsAntes = (itQ.data ?? []) as Array<{ producto_id: string; cantidad: number }>;

    // Ajuste de stock solo si ya estaba aprobada y no es de prueba.
    const ajustaStock = antes.estado === "aprobada" && !antes.prueba;
    const nowIso = new Date().toISOString();
    if (ajustaStock) {
      // Neto por (depósito, producto): se deshace lo aprobado y se aplica lo nuevo.
      const neto = new Map<string, { ubicacion: string; producto: string; delta: number }>();
      const sumar = (ub: string | null, prod: string, d: number) => {
        if (!ub || d === 0) return;
        const k = `${ub}|${prod}`;
        const e = neto.get(k) ?? { ubicacion: ub, producto: prod, delta: 0 };
        e.delta += d;
        neto.set(k, e);
      };
      const antesExterno = (antes.destino_tipo ?? "deposito") === "cliente";
      for (const i of itemsAntes) {
        sumar(antes.ubicacion_origen_id as string, i.producto_id, Number(i.cantidad));
        if (!antesExterno) sumar(antes.ubicacion_destino_id as string | null, i.producto_id, -Number(i.cantidad));
      }
      for (const i of itemsNuevos) {
        sumar(origenId, i.producto_id, -i.cantidad);
        if (destinoTipo === "deposito") sumar(destinoId, i.producto_id, i.cantidad);
      }
      const sb = supabase as unknown as AppSupabaseClient;
      const nombres = new Map<string, { nombre: string; sku: string | null }>();
      const pids = Array.from(new Set(Array.from(neto.values()).map((n) => n.producto)));
      if (pids.length) {
        const pq = await supabase.from("productos").select("id, nombre, sku").eq("empresa_id", auth.empresa_id).in("id", pids);
        for (const p of (pq.data ?? []) as Array<{ id: string; nombre: string; sku: string | null }>) nombres.set(p.id, { nombre: p.nombre, sku: p.sku });
      }
      const usuarioNombre = String(auth.user?.email ?? "Administrador");
      for (const n of neto.values()) {
        if (n.delta === 0) continue;
        await asegurarStockPorDeposito(sb, auth.empresa_id, n.producto);
        if (!esInstanciaLR()) {
          const fila = (await filasStockDeposito(sb, auth.empresa_id, [n.producto])).find((f) => f.ubicacion_id === n.ubicacion);
          if ((Number(fila?.stock_actual) || 0) + n.delta < 0) {
            return NextResponse.json(errorResponse(`Stock insuficiente de ${nombres.get(n.producto)?.nombre ?? n.producto} para aplicar el cambio.`), { status: 400 });
          }
        }
        await sumarStockDeposito(sb, auth.empresa_id, n.producto, n.ubicacion, n.delta);
        const info = nombres.get(n.producto);
        const mv = await supabase.from("movimientos_inventario").insert({
          empresa_id: auth.empresa_id,
          producto_id: n.producto,
          producto_nombre: info?.nombre ?? "?",
          producto_sku: info?.sku ?? null,
          tipo: n.delta > 0 ? "ENTRADA" : "SALIDA",
          cantidad: Math.abs(n.delta),
          costo_unitario: 0,
          origen: "nota_remision",
          referencia: `${antes.numero} (edición)`,
          fecha: nowIso,
          ubicacion_id: n.ubicacion,
          created_by: auth.usuarioCatalogId ?? auth.user?.id ?? null,
          usuario_nombre: usuarioNombre,
        });
        if (mv.error) console.warn(`[NR editar] movimiento falló: ${mv.error.message}`);
      }
    }

    const upd = await supabase
      .from("notas_remision")
      .update({ ...cambios, updated_at: nowIso })
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id);
    if (upd.error) return NextResponse.json(errorResponse(upd.error.message), { status: 400 });

    const del = await supabase.from("notas_remision_items").delete().eq("nota_remision_id", id);
    if (del.error) throw new Error(del.error.message);
    const ins = await supabase.from("notas_remision_items").insert(itemsNuevos.map((i) => ({ nota_remision_id: id, producto_id: i.producto_id, cantidad: i.cantidad })));
    if (ins.error) {
      // Restaurar los ítems anteriores para no dejar la nota vacía.
      if (itemsAntes.length) await supabase.from("notas_remision_items").insert(itemsAntes.map((i) => ({ nota_remision_id: id, producto_id: i.producto_id, cantidad: i.cantidad })));
      return NextResponse.json(errorResponse(`Items: ${ins.error.message}`), { status: 400 });
    }

    // Auditoría: solo lo que cambió.
    const diff: Record<string, { antes: unknown; despues: unknown }> = {};
    for (const [k, v] of Object.entries(cambios)) {
      const a = antes[k] ?? null;
      const norm = (x: unknown) => (k === "fecha" && x ? new Date(String(x)).getTime() : x ?? null);
      if (norm(a) !== norm(v)) diff[k] = { antes: a, despues: v };
    }
    const mapa = (l: ItemIn[]) => Object.fromEntries(l.map((i) => [i.producto_id, Number(i.cantidad)]));
    if (JSON.stringify(mapa([...itemsAntes].sort((x, y) => x.producto_id.localeCompare(y.producto_id)))) !== JSON.stringify(mapa([...itemsNuevos].sort((x, y) => x.producto_id.localeCompare(y.producto_id))))) {
      diff.items = { antes: itemsAntes, despues: itemsNuevos };
    }
    const aud = await supabase.from("notas_remision_auditoria").insert({
      empresa_id: auth.empresa_id,
      nota_remision_id: id,
      numero: antes.numero,
      usuario_id: auth.usuarioCatalogId ?? auth.user?.id ?? null,
      usuario_nombre: String(auth.user?.email ?? ""),
      cambios: diff,
    });
    if (aud.error) console.warn(`[NR editar] auditoría falló: ${aud.error.message}`);

    return NextResponse.json(successResponse({ editada: true, numero: antes.numero }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** DELETE /api/notas-remision/[id] — elimina la nota (solo admin). Libera la
 *  factura asociada para que pueda emitirse una nueva remisión. */
export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) {
      return NextResponse.json(errorResponse("Solo un administrador puede eliminar notas de remisión."), { status: 403 });
    }
    const { supabase, auth } = ctx;

    const { data: nr, error } = await supabase
      .from("notas_remision")
      .select("id, numero")
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!nr) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    const numero = (nr as { numero: string }).numero;

    // Liberar la factura (si tenía anotada esta nota) para que se pueda emitir otra.
    await supabase
      .from("facturas_exportacion")
      .update({ nota_remision: null })
      .eq("empresa_id", auth.empresa_id)
      .eq("nota_remision", numero);

    // Borrar items primero (FK a la nota).
    await supabase.from("notas_remision_items").delete().eq("nota_remision_id", id);
    const del = await supabase
      .from("notas_remision")
      .delete()
      .eq("empresa_id", auth.empresa_id)
      .eq("id", id);
    if (del.error) throw new Error(del.error.message);

    return NextResponse.json(successResponse({ eliminada: true }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
