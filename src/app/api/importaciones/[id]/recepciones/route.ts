import { NextRequest, NextResponse } from "next/server";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esUuid, getComexCtx, hoyPY, nombreUsuario, registrarHistorial } from "@/lib/comex/server";

const ESTADOS_RECEPCION = new Set(["arribado", "nacionalizada", "entregada"]);

/** Suma recibida por ítem en todas las recepciones de la importación. */
async function recibidoPorItem(sb: AppSupabaseClient, emp: string, importacionId: string): Promise<Map<string, number>> {
  const { data, error } = await sb
    .from("importacion_recepciones")
    .select("importacion_recepcion_items(item_id, cantidad)")
    .eq("empresa_id", emp)
    .eq("importacion_id", importacionId);
  if (error) throw new Error(error.message);
  const m = new Map<string, number>();
  for (const r of (data ?? []) as unknown as { importacion_recepcion_items: { item_id: string; cantidad: number }[] }[])
    for (const l of r.importacion_recepcion_items ?? []) m.set(l.item_id, (m.get(l.item_id) ?? 0) + Number(l.cantidad));
  return m;
}

async function actualizarRecibido(sb: AppSupabaseClient, emp: string, itemIds: string[], recibido: Map<string, number>) {
  const res = await Promise.all(
    itemIds.map((iid) =>
      sb.from("importacion_items").update({ cantidad_recibida: recibido.get(iid) ?? 0, updated_at: new Date().toISOString() }).eq("empresa_id", emp).eq("id", iid)
    )
  );
  const err = res.find((r) => r.error);
  if (err?.error) throw new Error(err.error.message);
}
const num = (n: number) => Number(n).toLocaleString("es-PY");

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("importacion_recepciones")
      .select("id, fecha, ubicacion_id, final, observacion, usuario_nombre, created_at, importacion_recepcion_items(item_id, cantidad)")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("importacion_id", id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const recepciones = ((data ?? []) as unknown as (Record<string, unknown> & { importacion_recepcion_items: unknown[] })[]).map(
      ({ importacion_recepcion_items, ...r }) => ({ ...r, items: importacion_recepcion_items ?? [] })
    );
    return NextResponse.json(successResponse({ recepciones }));
  } catch (err) {
    console.error("[/api/importaciones/:id/recepciones GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar las recepciones."), { status: 500 });
  }
}

/**
 * POST { fecha, ubicacion_id, final, observacion, items: [{ item_id, cantidad }] }
 * Registra lo que llegó. Si llegó de más, o si es la recepción final y faltó
 * algo, se crea una incidencia de diferencia (IMP-04). No mueve stock.
 */
export async function POST(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const { data: imp } = await ctx.supabase
      .from("importaciones")
      .select("estado, numero, responsable_id, responsable_nombre")
      .eq("empresa_id", emp)
      .eq("id", id)
      .maybeSingle();
    const im = imp as { estado: string; numero: string; responsable_id: string | null; responsable_nombre: string | null } | null;
    if (!im) return NextResponse.json(errorResponse("Importación no encontrada."), { status: 404 });
    if (!ESTADOS_RECEPCION.has(im.estado))
      return NextResponse.json(errorResponse("La recepción se carga cuando la importación ya arribó."), { status: 400 });

    const previas = await ctx.supabase.from("importacion_recepciones").select("id").eq("empresa_id", emp).eq("importacion_id", id).eq("final", true).limit(1);
    if (previas.error) throw new Error(previas.error.message);
    if ((previas.data ?? []).length)
      return NextResponse.json(errorResponse("La recepción ya se marcó como terminada."), { status: 400 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { data: itemsData, error: itemsErr } = await ctx.supabase
      .from("importacion_items")
      .select("id, producto_nombre, cantidad")
      .eq("empresa_id", emp)
      .eq("importacion_id", id);
    if (itemsErr) throw new Error(itemsErr.message);
    const items = (itemsData ?? []) as { id: string; producto_nombre: string; cantidad: number }[];
    const porId = new Map(items.map((i) => [i.id, i]));

    const lineas = (Array.isArray(b.items) ? b.items : [])
      .map((x) => x as { item_id?: string; cantidad?: unknown })
      .map((x) => ({ item_id: String(x.item_id ?? ""), cantidad: Number(x.cantidad) }))
      .filter((x) => porId.has(x.item_id) && Number.isFinite(x.cantidad) && x.cantidad > 0);
    const final = b.final === true;
    if (!lineas.length && !final) return NextResponse.json(errorResponse("Cargá cuánto llegó de al menos un producto."), { status: 400 });
    if ((Array.isArray(b.items) ? b.items : []).some((x) => Number((x as { cantidad?: unknown }).cantidad) < 0))
      return NextResponse.json(errorResponse("Las cantidades no pueden ser negativas."), { status: 400 });

    // Lo ya recibido (antes de esta carga) y lo que queda después de sumarla.
    const previo = await recibidoPorItem(ctx.supabase, emp, id);
    const recibido = new Map(previo);
    for (const l of lineas) recibido.set(l.item_id, (recibido.get(l.item_id) ?? 0) + l.cantidad);

    // Diferencias entre lo pedido y lo recibido.
    const diferencias: string[] = [];
    for (const i of items) {
      const r = recibido.get(i.id) ?? 0;
      const p = Number(i.cantidad);
      // El excedente se avisa solo cuando lo causa esta recepción (no se repite en cada carga).
      if (r > p && lineas.some((l) => l.item_id === i.id)) diferencias.push(`${i.producto_nombre}: se pidieron ${num(p)} y llegaron ${num(r)} (sobran ${num(r - p)})`);
      else if (final && r < p) diferencias.push(`${i.producto_nombre}: se pidieron ${num(p)} y llegaron ${num(r)} (faltan ${num(p - r)})`);
    }

    // Escrituras. Si algo falla se deshace lo hecho, para no dejar una recepción a medias.
    let recepcionId: string | null = null;
    let incidenciaId: string | null = null;
    try {
      const { data: rec, error } = await ctx.supabase
        .from("importacion_recepciones")
        .insert({
          empresa_id: emp,
          importacion_id: id,
          fecha: typeof b.fecha === "string" && /^\d{4}-\d{2}-\d{2}/.test(b.fecha) ? b.fecha.slice(0, 10) : hoyPY(),
          ubicacion_id: esUuid(b.ubicacion_id) ? b.ubicacion_id : null,
          final,
          observacion: b.observacion ? String(b.observacion).slice(0, 1000) : null,
          usuario_id: ctx.auth.usuarioCatalogId ?? null,
          usuario_nombre: nombreUsuario(ctx.auth),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      recepcionId = (rec as { id: string }).id;
      if (lineas.length) {
        const ins = await ctx.supabase
          .from("importacion_recepcion_items")
          .insert(lineas.map((l) => ({ empresa_id: emp, recepcion_id: recepcionId, item_id: l.item_id, cantidad: l.cantidad })));
        if (ins.error) throw new Error(ins.error.message);
      }
      if (diferencias.length) {
        const { data: inc, error: incErr } = await ctx.supabase
          .from("comex_incidencias")
          .insert({
            empresa_id: emp,
            origen_tipo: "IMPORTACION",
            origen_id: id,
            tipo: "DIFERENCIA_RECEPCION",
            descripcion: `${im.numero} · ${diferencias.join(". ")}.`,
            prioridad: "alta",
            estado: im.responsable_nombre ? "asignado" : "detectado",
            responsable_id: im.responsable_id,
            responsable_nombre: im.responsable_nombre,
            created_by_nombre: nombreUsuario(ctx.auth),
          })
          .select("id")
          .single();
        if (incErr) throw new Error(incErr.message);
        incidenciaId = (inc as { id: string }).id;
      }
      await actualizarRecibido(ctx.supabase, emp, items.map((i) => i.id), recibido);
    } catch (e) {
      if (incidenciaId) await ctx.supabase.from("comex_incidencias").delete().eq("empresa_id", emp).eq("id", incidenciaId);
      if (recepcionId) await ctx.supabase.from("importacion_recepciones").delete().eq("empresa_id", emp).eq("id", recepcionId);
      await actualizarRecibido(ctx.supabase, emp, items.map((i) => i.id), await recibidoPorItem(ctx.supabase, emp, id)).catch(() => undefined);
      throw new Error(`No se pudo registrar la recepción; no se guardó nada. ${e instanceof Error ? e.message : ""}`.trim());
    }

    await registrarHistorial(ctx.supabase, ctx.auth, "IMPORTACION", id, final ? "RECEPCION_FINAL" : "RECEPCION", {
      recibido: lineas.map((l) => ({ producto: porId.get(l.item_id)?.producto_nombre, cantidad: l.cantidad })),
      ...(diferencias.length ? { diferencias } : {}),
    });
    return NextResponse.json(successResponse({ id: recepcionId, diferencias, incidencia_id: incidenciaId }));
  } catch (err) {
    console.error("[/api/importaciones/:id/recepciones POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
