import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esUuid, getComexCtx, hoyPY, nombreUsuario } from "@/lib/comex/server";
import { saldosBancos, saldosCajas } from "@/lib/tesoreria/server";

type Punta = { tipo: "BANCO" | "CAJA"; id: string };

/**
 * POST { origen: {tipo, id}, destino: {tipo, id}, monto, fecha, referencia, observacion }
 * Banco → caja chica (reposición), banco → banco, caja → banco (devolución).
 * Crea los dos movimientos juntos; misma moneda en ambas puntas.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getComexCtx(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const emp = ctx.auth.empresa_id;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const o = b.origen as Punta | undefined;
    const d = b.destino as Punta | undefined;
    const monto = Number(b.monto);
    const tipoOk = (x: Punta | undefined) => x?.tipo === "BANCO" || x?.tipo === "CAJA";
    if (!o || !d || !tipoOk(o) || !tipoOk(d) || !esUuid(o.id) || !esUuid(d.id)) return NextResponse.json(errorResponse("Elegí de dónde sale y a dónde va."), { status: 400 });
    if (o.tipo === d.tipo && o.id === d.id) return NextResponse.json(errorResponse("El origen y el destino son la misma cuenta."), { status: 400 });
    if (o.tipo === "CAJA" && d.tipo === "CAJA") return NextResponse.json(errorResponse("Entre cajas chicas no se transfiere: pasá por el banco."), { status: 400 });
    if (!(monto > 0)) return NextResponse.json(errorResponse("El monto tiene que ser mayor a 0."), { status: 400 });
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha ?? "")) ? String(b.fecha) : hoyPY();

    const info = async (x: Punta) => {
      if (x.tipo === "BANCO") {
        const { data } = await ctx.supabase.from("entidades_bancarias").select("nombre, moneda, activo, tipo").eq("empresa_id", emp).eq("id", x.id).maybeSingle();
        const e = data as { nombre: string; moneda: string | null; activo: boolean; tipo: string } | null;
        return e && e.activo !== false && e.tipo === "banco" ? e : null;
      }
      const { data } = await ctx.supabase.from("cajas_chicas").select("nombre, moneda, activa").eq("empresa_id", emp).eq("id", x.id).maybeSingle();
      const k = data as { nombre: string; moneda: string; activa: boolean } | null;
      return k && k.activa !== false ? k : null;
    };
    const [io, id] = await Promise.all([info(o), info(d)]);
    if (!io || !id) return NextResponse.json(errorResponse("Alguna de las cuentas no existe o está inactiva."), { status: 404 });
    const moneda = io.moneda ?? "PYG";
    if (moneda !== (id.moneda ?? "PYG")) return NextResponse.json(errorResponse("Las dos cuentas tienen que ser de la misma moneda."), { status: 400 });
    if (o.tipo === "CAJA") {
      const saldo = (await saldosCajas(ctx.supabase, emp)).get(o.id) ?? 0;
      if (saldo < monto) return NextResponse.json(errorResponse(`La caja ${io.nombre} tiene ${saldo.toLocaleString("es-PY")}.`), { status: 400 });
    }
    let aviso: string | null = null;
    if (o.tipo === "BANCO") {
      const saldo = (await saldosBancos(ctx.supabase, emp)).get(o.id) ?? 0;
      if (saldo < monto) aviso = `La cuenta ${io.nombre} queda en negativo.`;
    }

    const grupo = randomUUID();
    const obs = String(b.observacion ?? "").trim() || (d.tipo === "CAJA" ? `Reposición de ${id.nombre}` : `Transferencia ${io.nombre} → ${id.nombre}`);
    const ref = b.referencia ? String(b.referencia).trim().slice(0, 60) : null;
    const quien = { usuario_nombre: nombreUsuario(ctx.auth), created_by_user_id: ctx.auth.usuarioCatalogId ?? null };
    const mov = (x: Punta, sale: boolean) =>
      x.tipo === "BANCO"
        ? ctx.supabase.from("banco_movimientos").insert({ empresa_id: emp, entidad_bancaria_id: x.id, tipo: sale ? "transferencia_out" : "transferencia_in", monto, moneda, fecha, referencia: ref, observacion: obs, transferencia_grupo: grupo, ...quien }).select("id").single()
        : ctx.supabase.from("caja_chica_movimientos").insert({ empresa_id: emp, caja_chica_id: x.id, tipo: sale ? "retiro" : "aporte", monto, fecha, referencia: ref, observacion: obs, transferencia_grupo: grupo, ...quien }).select("id").single();
    const r1 = await mov(o, true);
    if (r1.error) throw new Error(r1.error.message);
    const r2 = await mov(d, false);
    if (r2.error) {
      await ctx.supabase.from(o.tipo === "BANCO" ? "banco_movimientos" : "caja_chica_movimientos").delete().eq("id", (r1.data as { id: string }).id);
      throw new Error(r2.error.message);
    }
    return NextResponse.json(successResponse({ grupo, aviso }));
  } catch (err) {
    console.error("[/api/tesoreria/transferencias POST]", err);
    return NextResponse.json(errorResponse("No se pudo registrar la transferencia."), { status: 500 });
  }
}
