import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx } from "@/lib/comex/server";

/** GET — id de usuario (catálogo) de quien está conectado, para "asignadas a mí". */
export async function GET(request: NextRequest) {
  const ctx = await getComexCtx(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  return NextResponse.json(successResponse({ usuario_id: ctx.auth.usuarioCatalogId ?? null, nombre: ctx.auth.nombre ?? null }));
}
