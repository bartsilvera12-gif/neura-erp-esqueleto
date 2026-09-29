/**
 * Tesorería: saldos de cuentas bancarias y cajas chicas, y pagos de compras
 * que mueven esos saldos (banco_movimientos / caja_chica_movimientos).
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import type { UsuarioConEmpresaYRol } from "@/lib/middleware/auth";
import { nombreUsuario, registrarHistorial, traerTodo } from "@/lib/comex/server";

export class ErrorTesoreria extends Error {}

const SUMA_BANCO = new Set(["deposito", "transferencia_in", "ajuste"]);
const SUMA_CAJA = new Set(["aporte", "saldo_inicial"]);

export const signoBanco = (tipo: string, monto: number) => (SUMA_BANCO.has(tipo) ? monto : -monto);
/** Caja chica: el ajuste guarda su propio signo (puede ser negativo). */
export const signoCaja = (tipo: string, monto: number) => (SUMA_CAJA.has(tipo) || tipo === "ajuste" ? monto : -monto);

export interface CuentaBanco {
  id: string;
  nombre: string;
  tipo: string;
  numero_cuenta: string | null;
  moneda: string;
  titular: string | null;
  saldo_inicial: number;
  fecha_saldo_inicial: string | null;
  cuenta_contable_codigo: string | null;
  activo: boolean;
}
export interface CajaChica {
  id: string;
  nombre: string;
  moneda: string;
  tope_gasto: number | null;
  fondo_fijo: number | null;
  responsable_id: string | null;
  responsable_nombre: string | null;
  cuenta_contable_codigo: string | null;
  activa: boolean;
}

export async function saldosBancos(sb: AppSupabaseClient, emp: string): Promise<Map<string, number>> {
  const [ents, movs] = await Promise.all([
    traerTodo<{ id: string; saldo_inicial: number | null }>((a, b) => sb.from("entidades_bancarias").select("id, saldo_inicial").eq("empresa_id", emp).order("id").range(a, b)),
    traerTodo<{ entidad_bancaria_id: string; tipo: string; monto: number }>((a, b) =>
      sb.from("banco_movimientos").select("entidad_bancaria_id, tipo, monto").eq("empresa_id", emp).order("id").range(a, b)
    ),
  ]);
  const m = new Map<string, number>();
  for (const e of ents) m.set(e.id, Number(e.saldo_inicial) || 0);
  for (const x of movs)
    m.set(x.entidad_bancaria_id, (m.get(x.entidad_bancaria_id) ?? 0) + signoBanco(x.tipo, Number(x.monto)));
  return m;
}

export async function saldosCajas(sb: AppSupabaseClient, emp: string): Promise<Map<string, number>> {
  const movs = await traerTodo<{ caja_chica_id: string; tipo: string; monto: number }>((a, b) =>
    sb.from("caja_chica_movimientos").select("caja_chica_id, tipo, monto").eq("empresa_id", emp).order("id").range(a, b)
  );
  const m = new Map<string, number>();
  for (const x of movs)
    m.set(x.caja_chica_id, (m.get(x.caja_chica_id) ?? 0) + signoCaja(x.tipo, Number(x.monto)));
  return m;
}

export interface PagoInput {
  compraId: string;
  cuotaNro: number | null;
  fecha: string;
  monto: number;
  medio: "BANCO" | "CAJA_CHICA";
  cuentaId: string;
  referencia: string | null;
  /** Nota de crédito: la plata ENTRA a la cuenta (devolución del proveedor). */
  ingreso?: boolean;
}

/**
 * Valida que se pueda mover plata en esa cuenta: existe, activa, misma moneda,
 * tope y saldo de la caja chica (para egresos). `devuelve` suma al saldo lo que
 * vuelve a la caja por un pago anterior que se va a reemplazar.
 * Devuelve un aviso (banco en negativo) o tira ErrorTesoreria.
 */
export async function validarMovimiento(
  sb: AppSupabaseClient,
  emp: string,
  medio: "BANCO" | "CAJA_CHICA",
  cuentaId: string,
  moneda: string,
  monto: number,
  opts: { ingreso?: boolean; devuelve?: number } = {}
): Promise<{ nombre: string; aviso: string | null }> {
  if (medio === "BANCO") {
    const { data: e } = await sb.from("entidades_bancarias").select("id, nombre, moneda, activo, tipo").eq("empresa_id", emp).eq("id", cuentaId).maybeSingle();
    const cta = e as { id: string; nombre: string; moneda: string | null; activo: boolean; tipo: string } | null;
    if (!cta || cta.activo === false || cta.tipo !== "banco") throw new ErrorTesoreria("Esa cuenta bancaria no existe o está inactiva.");
    if ((cta.moneda ?? "PYG") !== moneda) throw new ErrorTesoreria(`La cuenta ${cta.nombre} es en ${cta.moneda ?? "PYG"} y el comprobante en ${moneda}.`);
    if (opts.ingreso) return { nombre: cta.nombre, aviso: null };
    const saldo = ((await saldosBancos(sb, emp)).get(cta.id) ?? 0) + (opts.devuelve ?? 0);
    return { nombre: cta.nombre, aviso: saldo - monto < 0 ? `La cuenta ${cta.nombre} queda en negativo (${(saldo - monto).toLocaleString("es-PY")}).` : null };
  }
  const { data: k } = await sb.from("cajas_chicas").select("id, nombre, moneda, activa, tope_gasto").eq("empresa_id", emp).eq("id", cuentaId).maybeSingle();
  const caja = k as { id: string; nombre: string; moneda: string; activa: boolean; tope_gasto: number | null } | null;
  if (!caja || caja.activa === false) throw new ErrorTesoreria("Esa caja chica no existe o está inactiva.");
  if (caja.moneda !== moneda) throw new ErrorTesoreria(`La caja ${caja.nombre} es en ${caja.moneda} y el comprobante en ${moneda}.`);
  if (opts.ingreso) return { nombre: caja.nombre, aviso: null };
  if (caja.tope_gasto && monto > Number(caja.tope_gasto))
    throw new ErrorTesoreria(`La caja ${caja.nombre} permite gastos de hasta ${Number(caja.tope_gasto).toLocaleString("es-PY")}.`);
  const saldo = ((await saldosCajas(sb, emp)).get(caja.id) ?? 0) + (opts.devuelve ?? 0);
  if (saldo < monto) throw new ErrorTesoreria(`La caja ${caja.nombre} tiene ${saldo.toLocaleString("es-PY")}: no alcanza para ${monto.toLocaleString("es-PY")}. Reponela primero.`);
  return { nombre: caja.nombre, aviso: null };
}

/**
 * Registra un pago de una compra y el egreso en el banco o la caja chica.
 * La cuenta tiene que ser de la misma moneda que la compra. La caja chica no
 * puede quedar en negativo; el banco sí (sobregiro), pero se avisa.
 */
export async function registrarPago(
  sb: AppSupabaseClient,
  auth: UsuarioConEmpresaYRol,
  p: PagoInput
): Promise<{ id: string; aviso: string | null }> {
  const emp = auth.empresa_id;
  if (!(p.monto > 0)) throw new ErrorTesoreria("El monto del pago tiene que ser mayor a 0.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) throw new ErrorTesoreria("Falta la fecha del pago.");
  const { data: c } = await sb
    .from("libro_compras")
    .select("id, moneda, estado, numero_control, nro_comprobante, proveedor_nombre, tipo_nombre")
    .eq("empresa_id", emp)
    .eq("id", p.compraId)
    .maybeSingle();
  const compra = c as { id: string; moneda: string; estado: string; numero_control: string; nro_comprobante: string; proveedor_nombre: string; tipo_nombre: string } | null;
  if (!compra) throw new ErrorTesoreria("El comprobante no existe.");
  if (compra.estado === "anulada") throw new ErrorTesoreria("El comprobante está anulado.");
  const concepto = `${compra.tipo_nombre} ${compra.proveedor_nombre} ${compra.nro_comprobante}`.slice(0, 200);

  const { aviso } = await validarMovimiento(sb, emp, p.medio, p.cuentaId, compra.moneda, p.monto, { ingreso: p.ingreso });
  const quien = { created_by_user_id: auth.usuarioCatalogId ?? null, usuario_nombre: nombreUsuario(auth) };
  let bancoMovId: string | null = null;
  let cajaMovId: string | null = null;
  if (p.medio === "BANCO") {
    const { data, error } = await sb
      .from("banco_movimientos")
      .insert({
        empresa_id: emp,
        entidad_bancaria_id: p.cuentaId,
        tipo: p.ingreso ? "deposito" : "retiro",
        monto: p.monto,
        moneda: compra.moneda,
        fecha: p.fecha,
        referencia: p.referencia,
        observacion: `${p.ingreso ? "Devolución" : "Pago"} ${concepto}`,
        compra_id: compra.id,
        ...quien,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    bancoMovId = (data as { id: string }).id;
  } else {
    const { data, error } = await sb
      .from("caja_chica_movimientos")
      .insert({
        empresa_id: emp,
        caja_chica_id: p.cuentaId,
        tipo: p.ingreso ? "aporte" : "gasto",
        monto: p.monto,
        fecha: p.fecha,
        referencia: p.referencia ?? compra.nro_comprobante,
        observacion: `${p.ingreso ? "Devolución " : ""}${concepto}`,
        compra_id: compra.id,
        ...quien,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    cajaMovId = (data as { id: string }).id;
  }

  const { data: pago, error: pErr } = await sb
    .from("libro_compras_pagos")
    .insert({
      empresa_id: emp,
      compra_id: compra.id,
      cuota_nro: p.cuotaNro,
      fecha: p.fecha,
      monto: p.monto,
      medio: p.medio,
      entidad_bancaria_id: p.medio === "BANCO" ? p.cuentaId : null,
      caja_chica_id: p.medio === "CAJA_CHICA" ? p.cuentaId : null,
      referencia: p.referencia,
      banco_movimiento_id: bancoMovId,
      caja_chica_movimiento_id: cajaMovId,
      usuario_nombre: nombreUsuario(auth),
    })
    .select("id")
    .single();
  if (pErr) {
    if (bancoMovId) await sb.from("banco_movimientos").delete().eq("id", bancoMovId);
    if (cajaMovId) await sb.from("caja_chica_movimientos").delete().eq("id", cajaMovId);
    throw new Error(pErr.message);
  }
  const pagoId = (pago as { id: string }).id;
  if (p.cuotaNro) {
    // Dos pagos a la vez de la misma cuota: si entre los dos se pasan del monto, este se deshace.
    const [{ data: q }, { data: ps }] = await Promise.all([
      sb.from("libro_compras_cuotas").select("monto").eq("empresa_id", emp).eq("compra_id", compra.id).eq("nro", p.cuotaNro).maybeSingle(),
      sb.from("libro_compras_pagos").select("monto").eq("empresa_id", emp).eq("compra_id", compra.id).eq("cuota_nro", p.cuotaNro).eq("estado", "vigente"),
    ]);
    const pagado = ((ps ?? []) as { monto: number }[]).reduce((s2, x) => s2 + Number(x.monto), 0);
    if (!q || pagado > Number((q as { monto: number }).monto) + 0.001) {
      await sb.from("libro_compras_pagos").delete().eq("empresa_id", emp).eq("id", pagoId);
      if (bancoMovId) await sb.from("banco_movimientos").delete().eq("id", bancoMovId);
      if (cajaMovId) await sb.from("caja_chica_movimientos").delete().eq("id", cajaMovId);
      throw new ErrorTesoreria(`La cuota ${p.cuotaNro} ya se pagó mientras tanto. Actualizá la pantalla.`);
    }
  }
  if (bancoMovId) await sb.from("banco_movimientos").update({ compra_pago_id: pagoId }).eq("id", bancoMovId);
  if (cajaMovId) await sb.from("caja_chica_movimientos").update({ compra_pago_id: pagoId }).eq("id", cajaMovId);
  if (p.cuotaNro) await recalcularCuota(sb, emp, compra.id, p.cuotaNro);
  await registrarHistorial(sb, auth, "COMPRA", compra.id, "PAGO", {
    monto: p.monto,
    medio: p.medio === "BANCO" ? "Banco" : "Caja chica",
    ...(p.cuotaNro ? { cuota: p.cuotaNro } : {}),
    ...(p.referencia ? { referencia: p.referencia } : {}),
  });
  return { id: pagoId, aviso };
}

/** Anula un pago: saca el movimiento del banco / caja y descuenta lo pagado de la cuota. */
export async function anularPago(sb: AppSupabaseClient, auth: UsuarioConEmpresaYRol, pagoId: string, motivo: string, compraId?: string): Promise<void> {
  const emp = auth.empresa_id;
  const { data } = await sb
    .from("libro_compras_pagos")
    .select("id, compra_id, cuota_nro, monto, estado, banco_movimiento_id, caja_chica_movimiento_id")
    .eq("empresa_id", emp)
    .eq("id", pagoId)
    .maybeSingle();
  const p = data as { id: string; compra_id: string; cuota_nro: number | null; monto: number; estado: string; banco_movimiento_id: string | null; caja_chica_movimiento_id: string | null } | null;
  if (!p || (compraId && p.compra_id !== compraId)) throw new ErrorTesoreria("El pago no existe.");
  if (p.estado === "anulado") return;
  if (p.banco_movimiento_id) await sb.from("banco_movimientos").delete().eq("empresa_id", emp).eq("id", p.banco_movimiento_id);
  if (p.caja_chica_movimiento_id) await sb.from("caja_chica_movimientos").delete().eq("empresa_id", emp).eq("id", p.caja_chica_movimiento_id);
  const { error } = await sb.from("libro_compras_pagos").update({ estado: "anulado", anulado_motivo: motivo.slice(0, 300) }).eq("empresa_id", emp).eq("id", pagoId);
  if (error) throw new Error(error.message);
  if (p.cuota_nro) await recalcularCuota(sb, emp, p.compra_id, p.cuota_nro);
  await registrarHistorial(sb, auth, "COMPRA", p.compra_id, "ANULAR_PAGO", { monto: p.monto, motivo });
}

/** Lo pagado de una cuota = suma de sus pagos vigentes. */
export async function recalcularCuota(sb: AppSupabaseClient, emp: string, compraId: string, nro: number): Promise<void> {
  const { data, error } = await sb.from("libro_compras_pagos").select("monto").eq("empresa_id", emp).eq("compra_id", compraId).eq("cuota_nro", nro).eq("estado", "vigente");
  if (error) throw new Error(error.message);
  const pagado = ((data ?? []) as { monto: number }[]).reduce((s, x) => s + Number(x.monto), 0);
  await sb.from("libro_compras_cuotas").update({ pagado }).eq("empresa_id", emp).eq("compra_id", compraId).eq("nro", nro);
}

/** Pagos vigentes de una compra (para mostrar y para sincronizar el contado). */
export async function pagosVigentes(sb: AppSupabaseClient, emp: string, compraId: string) {
  const { data, error } = await sb
    .from("libro_compras_pagos")
    .select("id, cuota_nro, fecha, monto, medio, entidad_bancaria_id, caja_chica_id, referencia, usuario_nombre, created_at")
    .eq("empresa_id", emp)
    .eq("compra_id", compraId)
    .eq("estado", "vigente")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; cuota_nro: number | null; fecha: string; monto: number; medio: "BANCO" | "CAJA_CHICA"; entidad_bancaria_id: string | null; caja_chica_id: string | null; referencia: string | null; usuario_nombre: string | null; created_at: string }[];
}
