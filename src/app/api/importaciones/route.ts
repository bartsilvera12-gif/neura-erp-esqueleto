import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const COLS =
  "id, numero, proveedor_id, proveedor_nombre, pais_origen, incoterm, moneda, monto_estimado, tipo_cambio, " +
  "fecha_pedido, fecha_embarque, fecha_arribo, fecha_nacionalizacion, ubicacion_exterior_id, ubicacion_destino_py_id, " +
  "estado, observaciones, created_at, updated_at";

const MONEDAS = new Set(["PYG", "USD", "BOB"]);
const ESTADOS = new Set([
  "borrador",
  "en_transito",
  "arribado",
  "nacionalizada",
  "entregada",
  "cerrada",
  "anulada",
]);

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sp = new URL(request.url).searchParams;
    let q = ctx.supabase
      .from("importaciones")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("created_at", { ascending: false })
      .limit(500);
    const estado = sp.get("estado");
    if (estado && ESTADOS.has(estado)) q = q.eq("estado", estado);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ importaciones: data ?? [] }));
  } catch (err) {
    console.error("[/api/importaciones GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar las importaciones."), { status: 500 });
  }
}

async function nextNumero(sb: NonNullable<Awaited<ReturnType<typeof getTenantSupabaseFromAuthWithRol>>>["supabase"], empresaId: string): Promise<string> {
  const { data } = await sb
    .from("importaciones")
    .select("numero")
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: false })
    .limit(1);
  const ultimo = ((data ?? [])[0] as { numero?: string } | undefined)?.numero ?? "IMP-000000";
  const match = ultimo.match(/(\d+)$/);
  const n = match ? Number(match[1]) + 1 : 1;
  return `IMP-${String(n).padStart(6, "0")}`;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const moneda = String(b.moneda ?? "USD").toUpperCase();
    if (!MONEDAS.has(moneda)) return NextResponse.json(errorResponse("Moneda no soportada."), { status: 400 });

    const numero = b.numero ? String(b.numero).trim() : await nextNumero(ctx.supabase, ctx.auth.empresa_id);

    const { data, error } = await ctx.supabase
      .from("importaciones")
      .insert({
        empresa_id: ctx.auth.empresa_id,
        numero,
        proveedor_id: b.proveedor_id ? String(b.proveedor_id) : null,
        proveedor_nombre: b.proveedor_nombre ? String(b.proveedor_nombre).trim().slice(0, 200) : null,
        pais_origen: b.pais_origen ? String(b.pais_origen).trim().slice(0, 20) : "BOL",
        incoterm: b.incoterm ? String(b.incoterm).trim().slice(0, 10) : null,
        moneda,
        monto_estimado: Number(b.monto_estimado) || 0,
        tipo_cambio: Number(b.tipo_cambio) || 1,
        fecha_pedido: b.fecha_pedido || null,
        fecha_embarque: b.fecha_embarque || null,
        fecha_arribo: b.fecha_arribo || null,
        fecha_nacionalizacion: b.fecha_nacionalizacion || null,
        ubicacion_exterior_id: b.ubicacion_exterior_id ? String(b.ubicacion_exterior_id) : null,
        ubicacion_destino_py_id: b.ubicacion_destino_py_id ? String(b.ubicacion_destino_py_id) : null,
        estado: "borrador",
        observaciones: b.observaciones ? String(b.observaciones).slice(0, 2000) : null,
        created_by_user_id: ctx.auth.usuarioCatalogId ?? null,
      })
      .select("id, numero")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse(data));
  } catch (err) {
    console.error("[/api/importaciones POST]", err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "Error interno"),
      { status: 500 },
    );
  }
}
