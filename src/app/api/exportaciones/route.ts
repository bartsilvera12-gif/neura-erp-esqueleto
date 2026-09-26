import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esUuid, getComexCtx, insertarConNumero, textoBusqueda, nombreUsuario, registrarHistorial } from "@/lib/comex/server";
import { ESTADO_EXPORTACION_LABEL } from "@/lib/comex/estados";
import { EXPORTACION_COLS } from "@/lib/exportaciones/types";


export async function GET(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sp = new URL(request.url).searchParams;
    let q = ctx.supabase
      .from("exportaciones")
      .select(EXPORTACION_COLS)
      .eq("empresa_id", ctx.auth.empresa_id)
      .order("created_at", { ascending: false })
      .limit(500);
    const estado = sp.get("estado");
    if (estado && estado in ESTADO_EXPORTACION_LABEL) q = q.eq("estado", estado);
    const responsable = sp.get("responsable");
    if (esUuid(responsable)) q = q.eq("responsable_id", responsable);
    const busca = textoBusqueda(sp.get("q"));
    if (busca) q = q.or(`numero.ilike.%${busca}%,cliente_nombre.ilike.%${busca}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ exportaciones: data ?? [] }));
  } catch (err) {
    console.error("[/api/exportaciones GET]", err);
    return NextResponse.json(errorResponse("No se pudieron cargar las exportaciones."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const cliente = String(b.cliente_nombre ?? "").trim();
    const pais = String(b.pais_destino ?? "").trim();
    const responsable = String(b.responsable_nombre ?? "").trim();
    const faltan = [!cliente && "cliente", !pais && "país de destino", !responsable && "responsable"].filter(Boolean);
    if (faltan.length) return NextResponse.json(errorResponse(`Completá: ${faltan.join(", ")}.`), { status: 400 });
    const sinProforma = b.requiere_proforma === false;
    const motivoSinProforma = String(b.motivo_sin_proforma ?? "").trim();
    if (sinProforma && !motivoSinProforma)
      return NextResponse.json(errorResponse("Indicá por qué no lleva proforma (por ejemplo: contenedor Sarasota)."), { status: 400 });

    const creada = await insertarConNumero(ctx.supabase, "exportaciones", emp, "EXP", {
        cliente_id: b.cliente_id ? String(b.cliente_id) : null,
        cliente_nombre: cliente.slice(0, 200),
        pais_destino: pais.slice(0, 60),
        productor: b.productor ? String(b.productor).trim().slice(0, 200) : null,
        requiere_proforma: !sinProforma,
        motivo_sin_proforma: sinProforma ? motivoSinProforma.slice(0, 300) : null,
        responsable_id: b.responsable_id ? String(b.responsable_id) : null,
        responsable_nombre: responsable.slice(0, 200),
        fecha_comprometida_embarque: b.fecha_comprometida_embarque || null,
        fecha_comprometida_entrega: b.fecha_comprometida_entrega || null,
        observaciones: b.observaciones ? String(b.observaciones).slice(0, 2000) : null,
        created_by_nombre: nombreUsuario(ctx.auth),
    });
    await registrarHistorial(ctx.supabase, ctx.auth, "EXPORTACION", creada.id, "CREAR", {
      numero: creada.numero,
      cliente,
      pais,
      responsable,
      ...(sinProforma ? { motivo: `Sin proforma: ${motivoSinProforma}` } : {}),
    });
    return NextResponse.json(successResponse(creada));
  } catch (err) {
    console.error("[/api/exportaciones POST]", err);
    return NextResponse.json(errorResponse(err instanceof Error ? err.message : "Error interno"), { status: 500 });
  }
}
