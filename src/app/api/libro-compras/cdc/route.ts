import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx } from "@/lib/comex/server";
import { leerCdc } from "@/lib/compras-libro/calculo";

/**
 * GET ?cdc= — "Precarga por CDC", paso 1: lee lo que trae el código (RUC,
 * número, fecha), busca el proveedor por RUC y avisa si ya está cargado.
 * Montos y timbrado necesitan la consulta a la SET (certificado digital).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const l = leerCdc(new URL(request.url).searchParams.get("cdc") ?? "");
    if (!l.ok) return NextResponse.json(errorResponse(l.error), { status: 400 });
    const emp = ctx.auth.empresa_id;
    const [prov, dup] = await Promise.all([
      ctx.supabase.from("proveedores").select("id, nombre, ruc").eq("empresa_id", emp).or(`ruc.eq.${l.ruc},ruc.like.${l.ruc}-%`).limit(1),
      ctx.supabase.from("libro_compras").select("numero_control").eq("empresa_id", emp).eq("cdc", l.cdc).neq("estado", "anulada").limit(1),
    ]);
    const proveedor = ((prov.data ?? [])[0] as { id: string; nombre: string; ruc: string } | undefined) ?? null;
    const yaCargado = ((dup.data ?? [])[0] as { numero_control: string } | undefined)?.numero_control ?? null;
    return NextResponse.json(successResponse({ ...l, proveedor, ya_cargado: yaCargado }));
  } catch (err) {
    console.error("[/api/libro-compras/cdc GET]", err);
    return NextResponse.json(errorResponse("No se pudo leer el CDC."), { status: 500 });
  }
}
