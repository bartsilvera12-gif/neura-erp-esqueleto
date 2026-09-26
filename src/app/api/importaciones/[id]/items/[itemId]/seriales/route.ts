import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { registrarHistorial } from "@/lib/comex/server";

type Params = { params: Promise<{ id: string; itemId: string }> };

export async function GET(request: NextRequest, p: Params) {
  try {
    const { id, itemId } = await p.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data, error } = await ctx.supabase
      .from("importacion_seriales")
      .select("id, serial, created_at")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("importacion_id", id)
      .eq("item_id", itemId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ seriales: data ?? [] }));
  } catch (err) {
    console.error("[seriales GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar los seriales."), { status: 500 });
  }
}

/**
 * POST { seriales: string[] } — agrega seriales al ítem.
 * Un serial repetido (en la lista o en cualquier importación) se rechaza y
 * queda en el historial (IMP-03). No se pueden cargar más que la cantidad pedida.
 */
export async function POST(request: NextRequest, p: Params) {
  try {
    const { id, itemId } = await p.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const [imp, item, actuales] = await Promise.all([
      ctx.supabase.from("importaciones").select("estado").eq("empresa_id", emp).eq("id", id).maybeSingle(),
      ctx.supabase.from("importacion_items").select("producto_nombre, cantidad").eq("empresa_id", emp).eq("importacion_id", id).eq("id", itemId).maybeSingle(),
      ctx.supabase.from("importacion_seriales").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("item_id", itemId),
    ]);
    if (!imp.data || !item.data) return NextResponse.json(errorResponse("Ítem no encontrado."), { status: 404 });
    const estado = (imp.data as { estado: string }).estado;
    if (estado === "anulada" || estado === "cerrada")
      return NextResponse.json(errorResponse("La importación está cerrada o anulada."), { status: 400 });
    const it = item.data as { producto_nombre: string; cantidad: number };

    const b = (await request.json().catch(() => ({}))) as { seriales?: unknown };
    const lista = (Array.isArray(b.seriales) ? b.seriales : [])
      .map((s) => String(s ?? "").trim())
      .filter(Boolean);
    if (!lista.length) return NextResponse.json(errorResponse("Escribí al menos un serial."), { status: 400 });

    const vistos = new Set<string>();
    const repetidosEnLista = new Set<string>();
    for (const s of lista) {
      const k = s.toUpperCase();
      if (vistos.has(k)) repetidosEnLista.add(s);
      vistos.add(k);
    }

    // Duplicados contra lo ya cargado en cualquier importación de la empresa.
    const { data: existentes } = await ctx.supabase
      .from("importacion_seriales")
      .select("serial, importacion_id, importaciones(numero)")
      .eq("empresa_id", emp)
      .in("serial", lista);
    const enOtras = ((existentes ?? []) as unknown as { serial: string; importaciones: { numero: string } | null }[]).map(
      (e) => `${e.serial} (ya está en ${e.importaciones?.numero ?? "otra importación"})`
    );

    if (repetidosEnLista.size || enOtras.length) {
      const detalle = [
        ...(repetidosEnLista.size ? [`repetidos en lo que escribiste: ${[...repetidosEnLista].join(", ")}`] : []),
        ...(enOtras.length ? [`ya cargados: ${enOtras.join(", ")}`] : []),
      ];
      await registrarHistorial(ctx.supabase, ctx.auth, "IMPORTACION", id, "SERIAL_DUPLICADO_RECHAZADO", { producto: it.producto_nombre, detalle });
      return NextResponse.json(errorResponse(`Seriales duplicados, no se guardó nada. ${detalle.join(" · ")}.`), { status: 400 });
    }

    const total = (actuales.count ?? 0) + lista.length;
    if (total > Number(it.cantidad))
      return NextResponse.json(
        errorResponse(`"${it.producto_nombre}" tiene ${Number(it.cantidad)} unidades: no se pueden cargar ${total} seriales.`),
        { status: 400 }
      );

    const { error } = await ctx.supabase
      .from("importacion_seriales")
      .insert(lista.map((serial) => ({ empresa_id: emp, importacion_id: id, item_id: itemId, serial: serial.slice(0, 100) })));
    if (error) {
      // Carrera con otra carga simultánea: el índice único lo frena igual.
      if (/duplicate|unique/i.test(error.message)) return NextResponse.json(errorResponse("Algún serial ya estaba cargado. Actualizá y probá de nuevo."), { status: 400 });
      throw new Error(error.message);
    }
    await registrarHistorial(ctx.supabase, ctx.auth, "IMPORTACION", id, "AGREGAR_SERIALES", { producto: it.producto_nombre, seriales: lista });
    return NextResponse.json(successResponse({ agregados: lista.length }));
  } catch (err) {
    console.error("[seriales POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}

/** DELETE ?serialId= */
export async function DELETE(request: NextRequest, p: Params) {
  try {
    const { id, itemId } = await p.params;
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const serialId = new URL(request.url).searchParams.get("serialId");
    if (!serialId) return NextResponse.json(errorResponse("Falta el serial."), { status: 400 });
    const { data: imp } = await ctx.supabase.from("importaciones").select("estado").eq("empresa_id", ctx.auth.empresa_id).eq("id", id).maybeSingle();
    const estado = (imp as { estado?: string } | null)?.estado;
    if (!estado) return NextResponse.json(errorResponse("Importación no encontrada."), { status: 404 });
    if (estado === "anulada" || estado === "cerrada")
      return NextResponse.json(errorResponse("La importación está cerrada o anulada."), { status: 400 });
    const { data, error } = await ctx.supabase
      .from("importacion_seriales")
      .delete()
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("item_id", itemId)
      .eq("id", serialId)
      .select("serial")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) await registrarHistorial(ctx.supabase, ctx.auth, "IMPORTACION", id, "QUITAR_SERIAL", { serial: (data as { serial: string }).serial });
    return NextResponse.json(successResponse({ id: serialId }));
  } catch (err) {
    console.error("[seriales DELETE]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
