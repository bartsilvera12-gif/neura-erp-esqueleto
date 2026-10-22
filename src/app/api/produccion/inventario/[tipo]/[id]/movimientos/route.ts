import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { stockDeArticulo } from "@/lib/produccion/inventario-helper";

type Params = { params: Promise<{ tipo: string; id: string }> };

/** GET — kardex (libro de movimientos) de un artículo + su stock actual. */
export async function GET(request: NextRequest, p: Params) {
  try {
    const { tipo, id } = await p.params;
    if (tipo !== "tablero" && tipo !== "herraje") return NextResponse.json(errorResponse("Tipo de artículo inválido."), { status: 400 });
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;

    const mv = await sb.from("prod_inventario_movimientos")
      .select("id, tipo, cantidad, delta_fisico, delta_utilizable, unidad, ubicacion, referencia, motivo, reverso_de, usuario_nombre, fecha")
      .eq("empresa_id", emp).eq("articulo_tipo", tipo).eq("articulo_id", id)
      .order("fecha", { ascending: true });
    const stock = await stockDeArticulo(sb, emp, tipo, id);
    return NextResponse.json(successResponse({ movimientos: mv.data ?? [], stock }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
