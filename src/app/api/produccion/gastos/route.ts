import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { CATEGORIAS_GASTO, type CategoriaGasto } from "@/lib/produccion/gastos-helper";

const COLS = "id, proyecto_id, es_general, categoria, proveedor_id, proveedor_nombre, concepto, fecha, cantidad, costo_unitario, monto, tiene_comprobante, comprobante_numero, comprobante_path, aprobado, observaciones";

/** GET — gastos. Filtro: ?proyecto_id= (o ?general=1), ?desde=&hasta=. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sp = new URL(request.url).searchParams;
    let q = ctx.supabase.from("prod_gastos").select(COLS).eq("empresa_id", emp).order("fecha", { ascending: false });
    if (sp.get("proyecto_id")) q = q.eq("proyecto_id", sp.get("proyecto_id") as string);
    else if (sp.get("general") === "1") q = q.eq("es_general", true);
    if (sp.get("desde")) q = q.gte("fecha", sp.get("desde") as string);
    if (sp.get("hasta")) q = q.lte("fecha", sp.get("hasta") as string);
    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ gastos: data ?? [] }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}

/** POST — registra un gasto/compra. RB-016: proyecto o gasto general. RB-012: avisa duplicado proveedor+número. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const concepto = String(b.concepto ?? "").trim();
    if (!concepto) return NextResponse.json(errorResponse("El concepto es obligatorio."), { status: 400 });
    const proyectoId = String(b.proyecto_id ?? "").trim() || null;
    const esGeneral = b.es_general === true || !proyectoId;
    if (!proyectoId && !esGeneral) return NextResponse.json(errorResponse("Asigná el gasto a un proyecto o marcalo como general."), { status: 400 });
    const categoria = (CATEGORIAS_GASTO.includes(String(b.categoria) as CategoriaGasto) ? String(b.categoria) : "otro") as CategoriaGasto;

    const cantidad = Number(b.cantidad) || 0;
    const costo = Number(b.costo_unitario) || 0;
    const monto = b.monto != null && b.monto !== "" ? Number(b.monto) || 0 : Math.round(cantidad * costo * 100) / 100;
    const proveedorId = String(b.proveedor_id ?? "").trim() || null;
    const comprobanteNumero = String(b.comprobante_numero ?? "").trim() || null;

    // RB-012: avisar si ya existe un gasto con el mismo proveedor + número de comprobante.
    if (proveedorId && comprobanteNumero && b.confirmar_duplicado !== true) {
      const dup = await ctx.supabase.from("prod_gastos").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("proveedor_id", proveedorId).eq("comprobante_numero", comprobanteNumero);
      if ((dup.count ?? 0) > 0) {
        return NextResponse.json(errorResponse("Ya hay un gasto con ese proveedor y número de comprobante. Confirmá si querés registrarlo igual."), { status: 409 });
      }
    }

    const ins = await ctx.supabase.from("prod_gastos").insert({
      empresa_id: emp, proyecto_id: esGeneral ? null : proyectoId, es_general: esGeneral, categoria,
      proveedor_id: proveedorId, proveedor_nombre: String(b.proveedor_nombre ?? "").trim() || null,
      concepto, fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha)) ? String(b.fecha) : new Date().toISOString().slice(0, 10),
      cantidad, costo_unitario: costo, monto,
      tiene_comprobante: b.tiene_comprobante === true || !!comprobanteNumero,
      comprobante_numero: comprobanteNumero,
      aprobado: b.aprobado !== false,
      observaciones: String(b.observaciones ?? "").trim() || null,
      created_by: ctx.auth.usuarioCatalogId ?? null, created_by_nombre: ctx.auth.user?.email ?? null,
    }).select(COLS).single();
    if (ins.error) return NextResponse.json(errorResponse(ins.error.message), { status: 400 });
    return NextResponse.json(successResponse({ gasto: ins.data }), { status: 201 });
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
