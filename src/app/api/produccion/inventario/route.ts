import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { stockPorTipo } from "@/lib/produccion/inventario-helper";

type Fila = {
  articulo_tipo: "tablero" | "herraje";
  articulo_id: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  stock_minimo: number | null;
  fisico: number; utilizable: number; reservado: number; disponible: number;
};

/** GET /api/produccion/inventario — stock de tableros y herrajes (físico, reservado, disponible). */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const sb = ctx.supabase as unknown as AppSupabaseClient;

    const [tabs, herr, stTab, stHer] = await Promise.all([
      sb.from("prod_tableros").select("id, codigo, tipo, espesor_valor, espesor_unidad, color_acabado, unidad_compra").eq("empresa_id", emp).eq("activo", true).order("codigo"),
      sb.from("prod_herrajes").select("id, codigo, descripcion, unidad, stock_minimo").eq("empresa_id", emp).eq("activo", true).order("codigo"),
      stockPorTipo(sb, emp, "tablero"),
      stockPorTipo(sb, emp, "herraje"),
    ]);

    const vacio = { fisico: 0, utilizable: 0, reservado: 0, disponible: 0 };
    const filas: Fila[] = [];
    for (const t of (tabs.data ?? []) as Record<string, unknown>[]) {
      const id = String(t.id);
      const esp = t.espesor_valor ? ` ${t.espesor_valor}${t.espesor_unidad ?? "mm"}` : "";
      const col = t.color_acabado ? ` · ${t.color_acabado}` : "";
      filas.push({ articulo_tipo: "tablero", articulo_id: id, codigo: String(t.codigo), descripcion: `${t.tipo ?? ""}${esp}${col}`.trim(), unidad: String(t.unidad_compra ?? "PLANCHA"), stock_minimo: null, ...(stTab[id] ?? vacio) });
    }
    for (const h of (herr.data ?? []) as Record<string, unknown>[]) {
      const id = String(h.id);
      filas.push({ articulo_tipo: "herraje", articulo_id: id, codigo: String(h.codigo), descripcion: String(h.descripcion ?? ""), unidad: String(h.unidad ?? "UNIDAD"), stock_minimo: h.stock_minimo == null ? null : Number(h.stock_minimo), ...(stHer[id] ?? vacio) });
    }
    return NextResponse.json(successResponse({ inventario: filas }));
  } catch (err) {
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error"), { status: 500 });
  }
}
