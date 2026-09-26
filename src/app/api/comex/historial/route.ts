import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { ORIGENES } from "@/lib/comex/server";
import type { OrigenComex } from "@/lib/comex/types";

/** GET ?origen_tipo=&origen_id= — historial de una operación, lo más nuevo primero. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sp = new URL(request.url).searchParams;
    const ot = sp.get("origen_tipo") as OrigenComex | null;
    const oid = sp.get("origen_id");
    if (!ot || !ORIGENES.has(ot) || !oid) return NextResponse.json(errorResponse("Falta la operación."), { status: 400 });

    const { data, error } = await ctx.supabase
      .from("comex_historial")
      .select("id, accion, detalle, usuario_nombre, created_at")
      .eq("empresa_id", ctx.auth.empresa_id)
      .eq("origen_tipo", ot)
      .eq("origen_id", oid)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    // Los cambios de cada contenedor también se anotan en su operación, así que acá ya aparecen.
    const historial = data ?? [];
    return NextResponse.json(successResponse({ historial }));
  } catch (err) {
    console.error("[/api/comex/historial GET]", err);
    return NextResponse.json(errorResponse("No se pudo cargar el historial."), { status: 500 });
  }
}
