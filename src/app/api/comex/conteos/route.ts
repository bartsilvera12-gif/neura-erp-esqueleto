import { filasStockDeposito, stockEnDeposito } from "@/lib/comex/stock-deposito";
import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esUuid, getComexCtx, nombreUsuario, registrarHistorial, traerTodo } from "@/lib/comex/server";

const COLS =
  "id, numero, ubicacion_id, ubicacion_nombre, pais, sector, categoria_id, categoria_nombre, responsable_id, responsable_nombre, estado, observaciones, cerrado_at, ajustado_at, ajustado_por_nombre, created_by_nombre, created_at";

/** GET ?estado= — conteos físicos con su avance (contados / total / con diferencia). */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    let q = ctx.supabase.from("inventario_conteos").select(COLS).eq("empresa_id", emp).order("created_at", { ascending: false }).limit(300);
    const estado = new URL(request.url).searchParams.get("estado");
    if (estado && ["en_curso", "cerrado", "ajustado", "anulado"].includes(estado)) q = q.eq("estado", estado);
    const c = await q;
    if (c.error) throw new Error(c.error.message);
    const ids = ((c.data ?? []) as unknown as { id: string }[]).map((x) => x.id);
    const it = ids.length
      ? await traerTodo<{ conteo_id: string; stock_sistema: number; cantidad_fisica: number | null }>((a, z) =>
          ctx.supabase.from("inventario_conteo_items").select("conteo_id, stock_sistema, cantidad_fisica").eq("empresa_id", emp).in("conteo_id", ids).order("id").range(a, z)
        )
      : [];
    const av = new Map<string, { total: number; contados: number; diferencias: number }>();
    for (const x of it) {
      const a = av.get(x.conteo_id) ?? { total: 0, contados: 0, diferencias: 0 };
      a.total++;
      if (x.cantidad_fisica !== null) {
        a.contados++;
        if (Number(x.cantidad_fisica) !== Number(x.stock_sistema)) a.diferencias++;
      }
      av.set(x.conteo_id, a);
    }
    return NextResponse.json(successResponse({ conteos: ((c.data ?? []) as unknown as { id: string }[]).map((x) => ({ ...x, ...(av.get(x.id) ?? { total: 0, contados: 0, diferencias: 0 }) })) }));
  } catch (err) {
    console.error("[/api/comex/conteos GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar los conteos."), { status: 500 });
  }
}

/**
 * POST { ubicacion_id, sector, categoria_id, responsable_id, responsable_nombre, observaciones }
 * Abre un conteo con la foto del stock del sistema de ese momento (no modifica stock).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const responsable = String(b.responsable_nombre ?? "").trim();
    if (!responsable) return NextResponse.json(errorResponse("Elegí el responsable del conteo."), { status: 400 });
    if (!esUuid(b.ubicacion_id)) return NextResponse.json(errorResponse("Elegí el depósito."), { status: 400 });

    const { data: ub } = await ctx.supabase.from("inventario_ubicaciones").select("id, nombre, pais").eq("empresa_id", emp).eq("id", b.ubicacion_id).maybeSingle();
    const u = ub as { id: string; nombre: string; pais: string | null } | null;
    if (!u) return NextResponse.json(errorResponse("Ese depósito no existe."), { status: 400 });
    let categoriaNombre: string | null = null;
    if (esUuid(b.categoria_id)) {
      const { data: cat } = await ctx.supabase.from("categorias_productos").select("nombre").eq("empresa_id", emp).eq("id", b.categoria_id).maybeSingle();
      categoriaNombre = (cat as { nombre: string } | null)?.nombre ?? null;
    }

    // Productos a contar: los activos de ese depósito (y categoría, si se eligió), con el
    // stock que el sistema tiene EN ESE depósito (no el total de todos los depósitos).
    type Prod = { id: string; nombre: string; sku: string | null; stock_actual: number; ubicacion_principal_id: string | null };
    const todos = await traerTodo<Prod>((a, z) => {
      let pq = ctx.supabase
        .from("productos")
        .select("id, nombre, sku, stock_actual, ubicacion_principal_id")
        .eq("empresa_id", emp)
        .eq("activo", true)
        .order("nombre")
        .order("id")
        .range(a, z);
      if (esUuid(b.categoria_id)) pq = pq.eq("categoria_principal_id", b.categoria_id);
      return pq;
    });
    const filas = await filasStockDeposito(ctx.supabase, emp);
    const enDeposito = new Set(filas.filter((f) => f.ubicacion_id === u.id).map((f) => f.producto_id));
    const lista = todos.filter((x) => x.ubicacion_principal_id === u.id || enDeposito.has(x.id));
    const stockAca = stockEnDeposito(lista, filas, u.id);
    if (!lista.length) return NextResponse.json(errorResponse("No hay productos activos asignados a ese depósito (y categoría)."), { status: 400 });

    const { data: ult } = await ctx.supabase.from("inventario_conteos").select("numero").eq("empresa_id", emp).order("numero", { ascending: false }).limit(1);
    const m = (((ult ?? [])[0] as { numero?: string } | undefined)?.numero ?? "").match(/(\d+)$/);
    const numero = `CNT-${String((m ? Number(m[1]) : 0) + 1).padStart(6, "0")}`;
    const { data: conteo, error } = await ctx.supabase
      .from("inventario_conteos")
      .insert({
        empresa_id: emp,
        numero,
        ubicacion_id: u.id,
        ubicacion_nombre: u.nombre,
        pais: u.pais ?? "PY",
        sector: b.sector ? String(b.sector).trim().slice(0, 80) : null,
        categoria_id: esUuid(b.categoria_id) ? b.categoria_id : null,
        categoria_nombre: categoriaNombre,
        responsable_id: esUuid(b.responsable_id) ? b.responsable_id : null,
        responsable_nombre: responsable.slice(0, 200),
        observaciones: b.observaciones ? String(b.observaciones).slice(0, 1000) : null,
        created_by_nombre: nombreUsuario(ctx.auth),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const conteoId = (conteo as { id: string }).id;
    const ins = await ctx.supabase.from("inventario_conteo_items").insert(
      lista.map((p) => ({ empresa_id: emp, conteo_id: conteoId, producto_id: p.id, producto_nombre: p.nombre, sku: p.sku, categoria_nombre: categoriaNombre, stock_sistema: stockAca.get(p.id) ?? 0 }))
    );
    if (ins.error) {
      await ctx.supabase.from("inventario_conteos").delete().eq("id", conteoId);
      throw new Error(ins.error.message);
    }
    await registrarHistorial(ctx.supabase, ctx.auth, "CONTEO", conteoId, "CREAR", { numero, deposito: u.nombre, productos: lista.length, responsable });
    return NextResponse.json(successResponse({ id: conteoId, numero }));
  } catch (err) {
    console.error("[/api/comex/conteos POST]", err);
    return NextResponse.json(errorResponse("No se pudo abrir el conteo."), { status: 500 });
  }
}
