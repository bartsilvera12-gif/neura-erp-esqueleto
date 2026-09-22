import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";

export const dynamic = "force-dynamic";

const ESTADOS = ["PENDIENTE", "CORRECTA", "ANULADA", "PENDIENTE_REEMISION", "REEMITIDA"];

function txt(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s || null;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const estado = new URL(request.url).searchParams.get("estado");

    let q = ctx.supabase
      .from("facturas_regularizacion")
      .select("*")
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("fecha_original", { ascending: false })
      .order("numero_original", { ascending: false });
    if (estado && ESTADOS.includes(estado)) q = q.eq("estado", estado);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const filas = (data ?? []) as unknown as Array<Record<string, unknown>>;
    const ids = filas.map((f) => f.factura_vinculada_id).filter(Boolean) as string[];
    const numeros = new Map<string, string>();
    if (ids.length) {
      const fx = await ctx.supabase.from("facturas_exportacion").select("id, numero_formateado").in("id", ids);
      for (const r of (fx.data ?? []) as unknown as Array<{ id: string; numero_formateado: string }>) numeros.set(r.id, r.numero_formateado);
    }
    return NextResponse.json(
      successResponse({
        regularizaciones: filas.map((f) => ({
          ...f,
          factura_vinculada_numero: f.factura_vinculada_id ? numeros.get(f.factura_vinculada_id as string) ?? null : null,
        })),
      })
    );
  } catch (err) {
    console.error("[/api/facturas-regularizacion GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las facturas a regularizar."), { status: 500 });
  }
}

/** Registra una factura del sistema anterior. No emite factura ni consume correlativo. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    if (!esRolAdminEmpresaOGlobal(auth.rol))
      return NextResponse.json(errorResponse("Solo un administrador puede registrar facturas a regularizar."), { status: 403 });

    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const numero = txt(b.numero_original);
    const fecha = txt(b.fecha_original);
    const timbrado = txt(b.timbrado_original);
    const cliente = txt(b.cliente_nombre);
    const motivo = txt(b.motivo);
    if (!numero || !fecha || !timbrado || !cliente || !motivo)
      return NextResponse.json(
        errorResponse("Completá número, fecha, timbrado original, cliente y motivo."),
        { status: 400 }
      );

    const nombre = auth.nombre ?? auth.user.email ?? null;
    const ins = await supabase
      .from("facturas_regularizacion")
      .insert({
        empresa_id: auth.empresa_id,
        numero_original: numero,
        fecha_original: fecha.slice(0, 10),
        timbrado_original: timbrado,
        punto_original: txt(b.punto_original),
        cliente_nombre: cliente,
        cliente_pais: txt(b.cliente_pais),
        moneda: (txt(b.moneda) ?? "USD").toUpperCase(),
        total: Number(b.total) || 0,
        motivo,
        estado: "PENDIENTE",
        observaciones: txt(b.observaciones),
        created_by: auth.user.id,
        created_by_nombre: nombre,
      })
      .select("*")
      .single();
    if (ins.error) {
      if (/duplicate|unique|23505/i.test(ins.error.message))
        return NextResponse.json(errorResponse("Esa factura ya está registrada (mismo número y timbrado)."), { status: 409 });
      throw new Error(ins.error.message);
    }
    const reg = ins.data as unknown as { id: string };

    await supabase.from("facturas_exportacion_auditoria").insert({
      empresa_id: auth.empresa_id,
      accion: "REGULARIZACION_REGISTRAR",
      detalle: { regularizacion_id: reg.id, numero_original: numero, timbrado_original: timbrado, motivo },
      usuario_id: auth.user.id,
      usuario_nombre: nombre,
    });
    return NextResponse.json(successResponse({ regularizacion: ins.data }));
  } catch (err) {
    console.error("[/api/facturas-regularizacion POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo registrar la factura."), { status: 500 });
  }
}
