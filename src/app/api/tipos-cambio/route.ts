import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const MONEDAS = new Set(["PYG", "USD", "BOB"]);
const COLS = "id, empresa_id, fecha, moneda_origen, moneda_destino, tasa, observacion, created_by_user_id, created_at";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sp = new URL(request.url).searchParams;
    let q = ctx.supabase
      .from("tipos_cambio")
      .select(COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    const from = sp.get("from");
    const to = sp.get("to");
    if (from) q = q.eq("moneda_origen", from);
    if (to) q = q.eq("moneda_destino", to);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ tasas: data ?? [] }));
  } catch (err) {
    console.error("[/api/tipos-cambio GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar las tasas."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const from = String(b.moneda_origen ?? "").toUpperCase();
    const to = String(b.moneda_destino ?? "").toUpperCase();
    const tasa = Number(b.tasa);
    if (!MONEDAS.has(from) || !MONEDAS.has(to)) {
      return NextResponse.json(errorResponse("Moneda no soportada (usá PYG, USD o BOB)."), { status: 400 });
    }
    if (from === to) return NextResponse.json(errorResponse("Origen y destino deben ser distintos."), { status: 400 });
    if (!Number.isFinite(tasa) || tasa <= 0) {
      return NextResponse.json(errorResponse("Tasa inválida."), { status: 400 });
    }
    const fecha = typeof b.fecha === "string" && b.fecha ? b.fecha : new Date().toISOString().slice(0, 10);

    const { data, error } = await ctx.supabase
      .from("tipos_cambio")
      .upsert(
        {
          empresa_id: ctx.auth.empresa_id,
          fecha,
          moneda_origen: from,
          moneda_destino: to,
          tasa,
          observacion: b.observacion ? String(b.observacion).slice(0, 300) : null,
          created_by_user_id: ctx.auth.usuarioCatalogId ?? null,
        },
        { onConflict: "empresa_id,fecha,moneda_origen,moneda_destino" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ id: (data as { id: string }).id }));
  } catch (err) {
    console.error("[/api/tipos-cambio POST]", err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "Error interno"),
      { status: 500 },
    );
  }
}
