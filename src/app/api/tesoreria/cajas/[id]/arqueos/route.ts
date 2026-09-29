import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComexCtx, hoyPY, nombreUsuario } from "@/lib/comex/server";
import { saldosCajas } from "@/lib/tesoreria/server";
import { calcularTotalArqueo, normalizarArqueo } from "@/lib/caja/denominaciones";

/**
 * POST { detalle: [{tipo, denominacion, cantidad}] | contado, observacion, ajustar }
 * Arqueo de caja chica: compara el saldo del sistema con lo contado. Si hay
 * diferencia y se pide ajustar, registra un movimiento de ajuste por la diferencia.
 */
export async function POST(request: NextRequest, p: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await p.params;
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const { data: caja } = await ctx.supabase.from("cajas_chicas").select("nombre, moneda").eq("empresa_id", emp).eq("id", id).maybeSingle();
    if (!caja) return NextResponse.json(errorResponse("La caja no existe."), { status: 404 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    // En guaraníes se cuenta billete por billete; en otra moneda se escribe el total.
    let detalle = null as ReturnType<typeof normalizarArqueo>;
    let contado: number;
    if ((caja as { moneda: string }).moneda === "PYG") {
      detalle = normalizarArqueo(b.detalle);
      if (!detalle) return NextResponse.json(errorResponse("El conteo de billetes y monedas no es válido."), { status: 400 });
      contado = calcularTotalArqueo(detalle);
    } else {
      contado = Number(b.contado);
      if (!(contado >= 0)) return NextResponse.json(errorResponse("Escribí el total contado."), { status: 400 });
    }
    const saldo = (await saldosCajas(ctx.supabase, emp)).get(id) ?? 0;
    const diferencia = Math.round((contado - saldo) * 100) / 100;
    const observacion = String(b.observacion ?? "").trim() || null;
    if (diferencia !== 0 && b.ajustar === true && !observacion)
      return NextResponse.json(errorResponse("Para ajustar la diferencia, explicá el motivo en la observación."), { status: 400 });

    const { data: arq, error } = await ctx.supabase
      .from("caja_chica_arqueos")
      .insert({ empresa_id: emp, caja_chica_id: id, saldo_sistema: saldo, contado, diferencia, detalle, observacion, usuario_nombre: nombreUsuario(ctx.auth) })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const arqueoId = (arq as { id: string }).id;
    if (diferencia !== 0 && b.ajustar === true) {
      const { data: mov, error: mErr } = await ctx.supabase
        .from("caja_chica_movimientos")
        .insert({
          empresa_id: emp,
          caja_chica_id: id,
          tipo: "ajuste",
          monto: diferencia,
          fecha: hoyPY(),
          observacion: `Ajuste por arqueo: ${observacion}`.slice(0, 300),
          arqueo_id: arqueoId,
          created_by_user_id: ctx.auth.usuarioCatalogId ?? null,
          usuario_nombre: nombreUsuario(ctx.auth),
        })
        .select("id")
        .single();
      if (mErr) throw new Error(mErr.message);
      await ctx.supabase.from("caja_chica_arqueos").update({ ajuste_movimiento_id: (mov as { id: string }).id }).eq("id", arqueoId);
    }
    return NextResponse.json(successResponse({ id: arqueoId, saldo_sistema: saldo, contado, diferencia }));
  } catch (err) {
    console.error("[/api/tesoreria/cajas/:id/arqueos POST]", err);
    return NextResponse.json(errorResponse("No se pudo registrar el arqueo."), { status: 500 });
  }
}
