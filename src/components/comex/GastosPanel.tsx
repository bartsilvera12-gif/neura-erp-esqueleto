"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { MONEDAS_COMEX, TIPOS_GASTO_COMEX, gastoEnGuaranies, totalesGastos, type GastoComex } from "@/lib/comex/gastos";
import { Aviso, api, btnPrimario, btnSecundario, fechaES, hoyPY, inputClass, jsonInit, labelClass, noRueda, sinFlechas } from "./ui";

const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
const monto = (n: number, moneda: string) =>
  moneda === "PYG" ? gs(n) : `${moneda} ${Number(n).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const vacio = {
  fecha: hoyPY(),
  tipo: TIPOS_GASTO_COMEX[0],
  descripcion: "",
  proveedor_nombre: "",
  comprobante: "",
  monto: "",
  moneda: "PYG",
  tipo_cambio: "",
  cuenta_codigo: "",
  pagado: false,
};

type CuentaPlan = { cuenta: string; denominacion: string; asentable?: boolean | null; activo?: boolean | null };

/**
 * Gastos incurridos de una importación o exportación: flete, seguro,
 * despachante, tributos, almacenaje. Muestra el total en guaraníes y cuánto
 * queda por pagar, para saber lo que realmente costó la operación.
 */
export default function GastosPanel({
  origenTipo,
  origenId,
  bloqueado,
  onCambio,
}: {
  origenTipo: "IMPORTACION" | "EXPORTACION";
  origenId: string;
  /** Operación cerrada o anulada: solo lectura. */
  bloqueado?: boolean;
  onCambio?: () => void;
}) {
  const [lista, setLista] = useState<GastoComex[]>([]);
  const [f, setF] = useState(vacio);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quitar, setQuitar] = useState<GastoComex | null>(null);
  // Plan de cuentas, para enlazar el gasto con contabilidad. Si la empresa
  // todavía no lo cargó, el campo no se muestra.
  const [cuentas, setCuentas] = useState<CuentaPlan[]>([]);

  const cargar = useCallback(async () => {
    try {
      const d = await api<{ gastos: GastoComex[] }>(`/api/comex/gastos?origen_tipo=${origenTipo}&origen_id=${origenId}`);
      setLista(d.gastos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [origenTipo, origenId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    api<{ cuentas: CuentaPlan[] }>("/api/configuracion/plan-cuentas")
      .then((d) => setCuentas((d.cuentas ?? []).filter((c) => c.activo !== false && c.asentable !== false)))
      .catch(() => setCuentas([]));
  }, []);

  const t = useMemo(() => totalesGastos(lista), [lista]);

  async function agregar() {
    setGuardando(true);
    setError(null);
    try {
      await api(
        "/api/comex/gastos",
        jsonInit("POST", {
          origen_tipo: origenTipo,
          origen_id: origenId,
          ...f,
          monto: Number(f.monto),
          tipo_cambio: f.moneda === "PYG" ? 1 : Number(f.tipo_cambio),
        })
      );
      setF({ ...vacio, fecha: f.fecha, moneda: f.moneda, tipo_cambio: f.tipo_cambio });
      setAbierto(false);
      await cargar();
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setGuardando(false);
    }
  }

  async function alternarPagado(g: GastoComex) {
    setError(null);
    try {
      await api(`/api/comex/gastos/${g.id}`, jsonInit("PATCH", { pagado: !g.pagado }));
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function confirmarQuitar() {
    if (!quitar) return;
    try {
      await api(`/api/comex/gastos/${quitar.id}`, { method: "DELETE" });
      setQuitar(null);
      await cargar();
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setQuitar(null);
    }
  }

  return (
    <section className="space-y-3">
      {/* Totales */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className={labelClass}>Total de gastos</p>
          <p className="text-xl font-semibold text-slate-900">{gs(t.total)}</p>
          <p className="text-xs text-slate-500">{lista.length} gasto{lista.length === 1 ? "" : "s"} cargado{lista.length === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className={labelClass}>Pendiente de pago</p>
          <p className={`text-xl font-semibold ${t.pendiente > 0 ? "text-amber-700" : "text-emerald-700"}`}>{gs(t.pendiente)}</p>
          <p className="text-xs text-slate-500">{t.pendiente > 0 ? "Hay gastos sin pagar" : "Todo pagado"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className={labelClass}>Por concepto</p>
          {t.porTipo.length === 0 ? (
            <p className="text-sm text-slate-500">—</p>
          ) : (
            <ul className="space-y-0.5 text-xs text-slate-600">
              {t.porTipo.slice(0, 4).map(([tipo, v]) => (
                <li key={tipo} className="flex justify-between gap-2">
                  <span className="truncate">{tipo}</span>
                  <span className="shrink-0 font-medium text-slate-800">{gs(v)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error && <Aviso>{error}</Aviso>}

      {!bloqueado && !abierto && (
        <button type="button" onClick={() => setAbierto(true)} className={btnPrimario}>
          <Plus className="h-3.5 w-3.5" /> Cargar gasto
        </button>
      )}

      {!bloqueado && abierto && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelClass}>Fecha</label>
              <input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Concepto *</label>
              <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} className={inputClass}>
                {TIPOS_GASTO_COMEX.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Monto *</label>
              <input
                type="number"
                min="0"
                step="any"
                value={f.monto}
                onWheel={noRueda}
                onChange={(e) => setF({ ...f, monto: e.target.value })}
                className={`${inputClass} ${sinFlechas}`}
              />
            </div>
            <div>
              <label className={labelClass}>Moneda</label>
              <select value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })} className={inputClass}>
                {MONEDAS_COMEX.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            {f.moneda !== "PYG" && (
              <div>
                <label className={labelClass}>Cambio a Gs. *</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={f.tipo_cambio}
                  onWheel={noRueda}
                  onChange={(e) => setF({ ...f, tipo_cambio: e.target.value })}
                  placeholder="Ej.: 7400"
                  className={`${inputClass} ${sinFlechas}`}
                />
              </div>
            )}
            <div>
              <label className={labelClass}>Proveedor</label>
              <input
                value={f.proveedor_nombre}
                onChange={(e) => setF({ ...f, proveedor_nombre: e.target.value })}
                placeholder="Quién cobró"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Comprobante</label>
              <input value={f.comprobante} onChange={(e) => setF({ ...f, comprobante: e.target.value })} placeholder="Nº factura o recibo" className={inputClass} />
            </div>
            {cuentas.length > 0 && (
              <div>
                <label className={labelClass}>Cuenta contable</label>
                <select value={f.cuenta_codigo} onChange={(e) => setF({ ...f, cuenta_codigo: e.target.value })} className={inputClass}>
                  <option value="">— Sin cuenta —</option>
                  {cuentas.map((c) => (
                    <option key={c.cuenta} value={c.cuenta}>
                      {c.cuenta} · {c.denominacion}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-2 lg:col-span-2">
              <label className={labelClass}>Detalle</label>
              <input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={f.pagado} onChange={(e) => setF({ ...f, pagado: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              Ya está pagado
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAbierto(false);
                  setF(vacio);
                }}
                className={btnSecundario}
              >
                Cancelar
              </button>
              <button type="button" onClick={() => void agregar()} disabled={guardando} className={btnPrimario}>
                {guardando ? "Guardando…" : "Guardar gasto"}
              </button>
            </div>
          </div>
          {f.moneda !== "PYG" && Number(f.monto) > 0 && Number(f.tipo_cambio) > 0 && (
            <p className="text-xs text-slate-500">
              Equivale a {gs(Number(f.monto) * Number(f.tipo_cambio))}.
            </p>
          )}
        </div>
      )}

      {/* Lista */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Concepto</th>
              <th className="px-4 py-2">Proveedor</th>
              <th className="px-4 py-2">Comprobante</th>
              <th className="px-4 py-2">Cuenta</th>
              <th className="px-4 py-2 text-right">Monto</th>
              <th className="px-4 py-2 text-right">En Gs.</th>
              <th className="px-4 py-2">Pago</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-500">
                  Todavía no hay gastos cargados en esta operación.
                </td>
              </tr>
            )}
            {lista.map((g) => (
              <tr key={g.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{fechaES(g.fecha)}</td>
                <td className="px-4 py-2">
                  <span className="font-medium text-slate-800">{g.tipo}</span>
                  {g.descripcion && <span className="block text-xs text-slate-500">{g.descripcion}</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">{g.proveedor_nombre ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-600">{g.comprobante ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-600">{g.cuenta_codigo ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-slate-700">{monto(g.monto, g.moneda)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-medium text-slate-900">{gs(gastoEnGuaranies(g))}</td>
                <td className="px-4 py-2">
                  {bloqueado ? (
                    <span className={`text-xs font-semibold ${g.pagado ? "text-emerald-700" : "text-amber-700"}`}>{g.pagado ? "Pagado" : "Pendiente"}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void alternarPagado(g)}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        g.pagado ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}
                      title="Cambiar"
                    >
                      {g.pagado ? "Pagado" : "Pendiente"}
                    </button>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {!bloqueado && (
                    <button type="button" onClick={() => setQuitar(g)} className="text-xs font-medium text-rose-600 hover:underline">
                      Quitar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {lista.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                <td colSpan={6} className="px-4 py-2 text-right">
                  Total
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right">{gs(t.total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <ConfirmModal
        open={!!quitar}
        title="Quitar gasto"
        message={`¿Quitar "${quitar?.tipo}" por ${quitar ? monto(quitar.monto, quitar.moneda) : ""}? Queda registrado en el historial.`}
        confirmLabel="Quitar"
        tone="danger"
        onConfirm={() => void confirmarQuitar()}
        onCancel={() => setQuitar(null)}
      />
    </section>
  );
}
