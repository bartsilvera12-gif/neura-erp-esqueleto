import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esUuid, getComexCtx, nombreUsuario, registrarHistorial } from "@/lib/comex/server";

const COLS =
  "id, proveedor_id, proveedor_nombre, importacion_id, productos, cantidad, fecha_comprometida, fecha_real, documentacion_requerida, documentacion_completa, estado, responsable_id, responsable_nombre, observaciones, created_by_nombre, created_at, updated_at";

/** GET ?estado=&proveedor= — compromisos de proveedores. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sp = new URL(request.url).searchParams;
    let q = ctx.supabase.from("proveedor_compromisos").select(COLS).eq("empresa_id", ctx.auth.empresa_id).order("fecha_comprometida").limit(1000);
    const estado = sp.get("estado");
    if (estado && ["pendiente", "cumplido", "cancelado"].includes(estado)) q = q.eq("estado", estado);
    const proveedor = sp.get("proveedor");
    if (esUuid(proveedor)) q = q.eq("proveedor_id", proveedor);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ compromisos: data ?? [] }));
  } catch (err) {
    console.error("[/api/comex/compromisos GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar los compromisos."), { status: 500 });
  }
}

/** POST — nuevo compromiso de un proveedor. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const proveedor = String(b.proveedor_nombre ?? "").trim();
    const productos = String(b.productos ?? "").trim();
    const fecha = String(b.fecha_comprometida ?? "");
    const faltan = [!proveedor && "proveedor", !productos && "qué se comprometió", !/^\d{4}-\d{2}-\d{2}$/.test(fecha) && "fecha comprometida"].filter(Boolean);
    if (faltan.length) return NextResponse.json(errorResponse(`Completá: ${faltan.join(", ")}.`), { status: 400 });
    const cantidad = b.cantidad === "" || b.cantidad == null ? null : Number(b.cantidad);
    if (cantidad !== null && !(cantidad > 0)) return NextResponse.json(errorResponse("La cantidad tiene que ser mayor a 0."), { status: 400 });
    const { data, error } = await ctx.supabase
      .from("proveedor_compromisos")
      .insert({
        empresa_id: ctx.auth.empresa_id,
        proveedor_id: esUuid(b.proveedor_id) ? b.proveedor_id : null,
        proveedor_nombre: proveedor.slice(0, 200),
        importacion_id: esUuid(b.importacion_id) ? b.importacion_id : null,
        productos: productos.slice(0, 1000),
        cantidad,
        fecha_comprometida: fecha,
        documentacion_requerida: b.documentacion_requerida ? String(b.documentacion_requerida).slice(0, 500) : null,
        responsable_id: esUuid(b.responsable_id) ? b.responsable_id : null,
        responsable_nombre: b.responsable_nombre ? String(b.responsable_nombre).slice(0, 200) : null,
        observaciones: b.observaciones ? String(b.observaciones).slice(0, 1000) : null,
        created_by_nombre: nombreUsuario(ctx.auth),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const id = (data as { id: string }).id;
    await registrarHistorial(ctx.supabase, ctx.auth, "COMPROMISO", id, "CREAR", { proveedor, descripcion: productos });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/comex/compromisos POST]", err);
    return NextResponse.json(errorResponse("No se pudo guardar el compromiso."), { status: 500 });
  }
}
