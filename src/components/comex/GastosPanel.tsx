"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { MONEDAS_COMEX, TIPOS_GASTO_COMEX, FACTOR_COSTO_SIN_IVA, gastoEnGuaranies, preAsientoGasto, totalesGastos, type GastoComex } from "@/lib/comex/gastos";
import { Aviso, api, btnPrimario, btnSecundario, fechaES, hoyPY, inputClass, jsonInit, labelClass, noRueda, sinFlechas } from "./ui";
import ImportExcelButton from "@/components/ui/ImportExcelButton";
import { ModalPagoCuota } from "@/app/libro-compras/_components/ModalPago";

const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
const monto = (n: number, moneda: string) =>
  moneda === "PYG" ? gs(n) : `${moneda} ${Number(n).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Tablita del pre-asiento (Cuenta · Debe · Haber), en guaraníes. */
function AsientoMini({
  lineas,
  cuentaNombre,
}: {
  lineas: { cuenta: string; detalle: string; debe: number; haber: number }[];
  cuentaNombre: Map<string, string>;
}) {
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <tr>
          <th className="py-0.5">Cuenta</th>
          <th className="py-0.5 text-right">Debe</th>
          <th className="py-0.5 text-right">Haber</th>
        </tr>
      </thead>
      <tbody>
        {lineas.map((l, i) => (
          <tr key={i} className="border-t border-slate-200/70">
            <td className="py-0.5 pr-2 font-mono text-slate-600">
              {l.cuenta}
              {cuentaNombre.get(l.cuenta) && <span className="ml-1 font-sans text-slate-400">{cuentaNombre.get(l.cuenta)}</span>}
              {l.detalle === "IVA Crédito Fiscal" && <span className="ml-1 font-sans text-slate-400">IVA Crédito Fiscal</span>}
            </td>
            <td className="py-0.5 pr-2 text-right text-slate-800">{l.debe ? gs(l.debe) : ""}</td>
            <td className="py-0.5 text-right text-slate-800">{l.haber ? gs(l.haber) : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const vacio = {
  fecha: hoyPY(),
  tipo: TIPOS_GASTO_COMEX[0],
  descripcion: "",
  proveedor_nombre: "",
  proveedor_ruc: "",
  comprobante: "",
  timbrado: "",
  monto: "",
  moneda: "PYG",
  tipo_cambio: "",
  cuenta_codigo: "",
  pagado: false,
  lleva_iva: false,
  iva_porcentaje: "10",
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
  // Texto visible del autocompletar de cuenta contable ("código · nombre").
  const [cuentaTexto, setCuentaTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  // Si está editando un gasto ya cargado, guarda su id (si no, es alta nueva).
  const [editId, setEditId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quitar, setQuitar] = useState<GastoComex | null>(null);
  // Plan de cuentas, para enlazar el gasto con contabilidad. Si la empresa
  // todavía no lo cargó, el campo no se muestra.
  const [cuentas, setCuentas] = useState<CuentaPlan[]>([]);
  // Cuentas del pre-asiento (IVA crédito y proveedores), del Libro de Compras.
  const [cfgCuentas, setCfgCuentas] = useState<{ iva: string; porPagar: string }>({ iva: "", porPagar: "" });
  // Gasto cuya factura se está pagando (abre el modal de pago de la cuota).
  const [pagar, setPagar] = useState<GastoComex | null>(null);
  // Gasto cuyo pre-asiento está desplegado en la lista.
  const [asientoAbierto, setAsientoAbierto] = useState<string | null>(null);

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
    // Solo-lectura: cualquier usuario de la empresa puede elegir una cuenta.
    // (El endpoint de configuración es admin-only y da 403 a los demás, dejando
    // el gasto con IVA sin poder asignar cuenta contable.)
    api<{ cuentas: CuentaPlan[] }>("/api/gastos/plan-cuentas")
      .then((d) => setCuentas((d.cuentas ?? []).filter((c) => c.activo !== false && c.asentable !== false)))
      .catch(() => setCuentas([]));
    api<{ config: { cuenta_iva_credito: string; cuenta_proveedores: string } }>("/api/libro-compras/config")
      .then((d) => setCfgCuentas({ iva: d.config?.cuenta_iva_credito ?? "", porPagar: d.config?.cuenta_proveedores ?? "" }))
      .catch(() => undefined);
  }, []);

  const t = useMemo(() => totalesGastos(lista), [lista]);
  // Total también en dólares: se usa el tipo de cambio de los gastos en USD.
  const cuentaNombre = useMemo(() => new Map(cuentas.map((c) => [c.cuenta, c.denominacion])), [cuentas]);
  const tcUSD = useMemo(() => {
    const g = lista.find((x) => x.moneda === "USD" && Number(x.tipo_cambio) > 0);
    return g ? Number(g.tipo_cambio) : 0;
  }, [lista]);
  const usd = (gsVal: number) => (tcUSD > 0 ? `USD ${(gsVal / tcUSD).toLocaleString("es-PY", { maximumFractionDigits: 2 })}` : null);

  /** Abre el formulario en blanco para cargar un gasto nuevo. */
  function abrirNuevo() {
    setEditId(null);
    setF(vacio);
    setCuentaTexto("");
    setError(null);
    setAbierto(true);
  }

  /** Abre el formulario precargado con los datos del gasto, para modificarlo. */
  function editar(g: GastoComex) {
    setEditId(g.id);
    setF({
      fecha: (g.fecha ?? "").slice(0, 10) || hoyPY(),
      tipo: g.tipo,
      descripcion: g.descripcion ?? "",
      proveedor_nombre: g.proveedor_nombre ?? "",
      proveedor_ruc: g.proveedor_ruc ?? "",
      comprobante: g.comprobante ?? "",
      timbrado: g.timbrado ?? "",
      monto: String(g.monto ?? ""),
      moneda: g.moneda || "PYG",
      tipo_cambio: g.tipo_cambio ? String(g.tipo_cambio) : "",
      cuenta_codigo: g.cuenta_codigo ?? "",
      pagado: !!g.pagado,
      lleva_iva: !!g.lleva_iva,
      iva_porcentaje: g.iva_porcentaje ? String(g.iva_porcentaje) : "10",
    });
    const nombre = g.cuenta_codigo ? cuentaNombre.get(g.cuenta_codigo) : "";
    setCuentaTexto(g.cuenta_codigo ? (nombre ? `${g.cuenta_codigo} · ${nombre}` : g.cuenta_codigo) : "");
    setError(null);
    setAbierto(true);
  }

  function cerrarForm() {
    setAbierto(false);
    setEditId(null);
    setF(vacio);
    setCuentaTexto("");
  }

  async function guardar() {
    if (f.tipo === "OTRO" && !f.descripcion.trim()) {
      setError('Cuando el concepto es "OTRO", poné el detalle del gasto.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const campos = {
        ...f,
        monto: Number(f.monto),
        tipo_cambio: f.moneda === "PYG" ? 1 : Number(f.tipo_cambio),
      };
      if (editId) {
        // Edición de un gasto ya cargado (incluye los cargados por Excel).
        await api(`/api/comex/gastos/${editId}`, jsonInit("PATCH", campos));
      } else {
        await api("/api/comex/gastos", jsonInit("POST", { origen_tipo: origenTipo, origen_id: origenId, ...campos }));
      }
      cerrarForm();
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
          <p className={labelClass}>Total de gastos (pago)</p>
          {usd(t.total) ? (
            <>
              <p className="text-xl font-semibold text-slate-900">{usd(t.total)}</p>
              <p className="text-xs font-medium text-slate-500">{gs(t.total)}</p>
            </>
          ) : (
            <p className="text-xl font-semibold text-slate-900">{gs(t.total)}</p>
          )}
          {t.totalCosto !== t.total ? (
            <p className="text-xs text-slate-500">Costo (sin IVA): <span className="font-medium text-slate-700">{usd(t.totalCosto) ?? gs(t.totalCosto)}</span>{usd(t.totalCosto) ? ` · ${gs(t.totalCosto)}` : ""}</p>
          ) : (
            <p className="text-xs text-slate-500">{lista.length} gasto{lista.length === 1 ? "" : "s"} cargado{lista.length === 1 ? "" : "s"}</p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className={labelClass}>Pendiente de pago</p>
          {usd(t.pendiente) ? (
            <>
              <p className={`text-xl font-semibold ${t.pendiente > 0 ? "text-amber-700" : "text-emerald-700"}`}>{usd(t.pendiente)}</p>
              <p className="text-xs font-medium text-slate-500">{gs(t.pendiente)}</p>
            </>
          ) : (
            <p className={`text-xl font-semibold ${t.pendiente > 0 ? "text-amber-700" : "text-emerald-700"}`}>{gs(t.pendiente)}</p>
          )}
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
                  <span className="shrink-0 text-right">
                    <span className="block font-medium text-slate-800">{usd(v) ?? gs(v)}</span>
                    {usd(v) && <span className="block text-[10px] text-slate-500">{gs(v)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error && <Aviso>{error}</Aviso>}

      {!bloqueado && !abierto && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={abrirNuevo} className={btnPrimario}>
            <Plus className="h-3.5 w-3.5" /> Cargar gasto
          </button>
          {origenTipo === "IMPORTACION" && (
            <ImportExcelButton
              entidad="Gastos"
              previewUrl={`/api/importaciones/${origenId}/gastos/import/preview`}
              commitUrl={`/api/importaciones/${origenId}/gastos/import/commit`}
              templateUrl={`/api/importaciones/${origenId}/gastos/import/template`}
              label="Cargar por Excel"
              titulo="Importar gastos desde Excel"
              onCompleted={() => { void cargar(); onCambio?.(); }}
            />
          )}
        </div>
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
              <label className={labelClass}>Proveedor{f.lleva_iva ? " *" : ""}</label>
              <input
                value={f.proveedor_nombre}
                onChange={(e) => setF({ ...f, proveedor_nombre: e.target.value })}
                placeholder="Quién cobró"
                className={inputClass}
              />
            </div>
            {f.lleva_iva && (
              <div>
                <label className={labelClass}>RUC proveedor *</label>
                <input value={f.proveedor_ruc} onChange={(e) => setF({ ...f, proveedor_ruc: e.target.value })} placeholder="80012345-6" className={`${inputClass} font-mono`} />
              </div>
            )}
            <div>
              <label className={labelClass}>Comprobante{f.lleva_iva ? " *" : ""}</label>
              <input value={f.comprobante} onChange={(e) => setF({ ...f, comprobante: e.target.value })} placeholder="Nº factura o recibo" className={inputClass} />
            </div>
            {f.lleva_iva && (
              <>
                <div>
                  <label className={labelClass}>Timbrado *</label>
                  <input value={f.timbrado} onChange={(e) => setF({ ...f, timbrado: e.target.value.replace(/\D/g, "") })} placeholder="12345678" className={`${inputClass} font-mono`} />
                </div>
                <div>
                  <label className={labelClass}>IVA</label>
                  <select value={f.iva_porcentaje} onChange={(e) => setF({ ...f, iva_porcentaje: e.target.value })} className={inputClass}>
                    <option value="10">10%</option>
                    <option value="5">5%</option>
                  </select>
                </div>
              </>
            )}
            {cuentas.length > 0 && (
              <div>
                <label className={labelClass}>Cuenta contable</label>
                {/* Autocompletar: se tipea (código o nombre) y el navegador filtra. */}
                <input
                  list="comex-cuentas"
                  value={cuentaTexto}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCuentaTexto(v);
                    // Toma el código que esté antes del " · ", o el texto tal cual.
                    const cod = v.split(" · ")[0].trim();
                    const match = cuentas.find((c) => c.cuenta === cod);
                    setF({ ...f, cuenta_codigo: match ? match.cuenta : "" });
                  }}
                  placeholder="Tipeá código o nombre…"
                  className={inputClass}
                  autoComplete="off"
                />
                <datalist id="comex-cuentas">
                  {cuentas.map((c) => (
                    <option key={c.cuenta} value={`${c.cuenta} · ${c.denominacion}`} />
                  ))}
                </datalist>
              </div>
            )}
            <div className="sm:col-span-2 lg:col-span-2">
              <label className={labelClass}>Detalle{f.tipo === "OTRO" ? " *" : ""}</label>
              <input
                value={f.descripcion}
                onChange={(e) => setF({ ...f, descripcion: e.target.value })}
                placeholder={f.tipo === "OTRO" ? "Especificá el gasto (ej.: Fotocopias)" : ""}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={f.pagado} onChange={(e) => setF({ ...f, pagado: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                Ya está pagado
              </label>
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={f.lleva_iva} onChange={(e) => setF({ ...f, lleva_iva: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                Lleva IVA
                <span className="text-xs text-slate-400">— va al Libro de Compras (el monto incluye el IVA)</span>
              </label>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={cerrarForm} className={btnSecundario}>
                Cancelar
              </button>
              <button type="button" onClick={() => void guardar()} disabled={guardando} className={btnPrimario}>
                {guardando ? "Guardando…" : editId ? "Guardar cambios" : "Guardar gasto"}
              </button>
            </div>
          </div>
          {f.moneda !== "PYG" && Number(f.monto) > 0 && Number(f.tipo_cambio) > 0 && (
            <p className="text-xs text-slate-500">
              Equivale a {gs(Number(f.monto) * Number(f.tipo_cambio))}.
            </p>
          )}
          {f.lleva_iva && Number(f.monto) > 0 && (
            <p className="text-xs text-slate-500">
              Pago (IVA incluido): {monto(Number(f.monto), f.moneda)} · IVA (÷ 11): {monto(Number(f.monto) / 11, f.moneda)} · Costo sin IVA: {monto(Number(f.monto) * FACTOR_COSTO_SIN_IVA, f.moneda)}.
            </p>
          )}
          {Number(f.monto) > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Pre-asiento (vista previa)</p>
              <AsientoMini
                lineas={preAsientoGasto(
                  {
                    monto: Number(f.monto),
                    tipo_cambio: f.moneda === "PYG" ? 1 : Number(f.tipo_cambio) || 1,
                    lleva_iva: f.lleva_iva,
                    cuenta_codigo: f.cuenta_codigo || null,
                    tipo: f.tipo,
                    proveedor_nombre: f.proveedor_nombre || null,
                  },
                  cfgCuentas
                )}
                cuentaNombre={cuentaNombre}
              />
              <p className="mt-1 text-[11px] text-slate-400">Es solo una vista previa; el asiento real se genera al cerrar la importación.</p>
            </div>
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
              <Fragment key={g.id}>
              <tr className="border-t border-slate-100">
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{fechaES(g.fecha)}</td>
                <td className="px-4 py-2">
                  <span className="font-medium text-slate-800">{g.tipo}</span>
                  {g.lleva_iva && (
                    <span className="ml-1.5 inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700" title="Lleva IVA 10% incluido: IVA = monto ÷ 11, costo sin IVA = monto × 10/11">
                      IVA
                    </span>
                  )}
                  {g.descripcion && <span className="block text-xs text-slate-500">{g.descripcion}</span>}
                  {g.factura && <span className="block text-[10px] text-slate-400">→ Libro de compras {g.factura.numero_control}</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">{g.proveedor_nombre ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-600">{g.comprobante ?? "—"}</td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  {g.cuenta_codigo ? (
                    <>
                      <span className="font-mono">{g.cuenta_codigo}</span>
                      {cuentaNombre.get(g.cuenta_codigo) && <span className="block text-slate-500">{cuentaNombre.get(g.cuenta_codigo)}</span>}
                    </>
                  ) : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-slate-700">{monto(g.monto, g.moneda)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-medium text-slate-900">{gs(gastoEnGuaranies(g))}</td>
                <td className="px-4 py-2">
                  {g.lleva_iva && g.libro_compra_id ? (
                    <div className="flex flex-col items-start gap-1">
                      <span className={`text-xs font-semibold ${g.factura && g.factura.saldo <= 0.001 ? "text-emerald-700" : "text-amber-700"}`}>
                        {!g.factura ? "—" : g.factura.saldo <= 0.001 ? "Pagado" : g.factura.pagado > 0 ? "Pago parcial" : "Cuenta por pagar"}
                      </span>
                      {!bloqueado && g.factura && g.factura.saldo > 0.001 && (
                        <button
                          type="button"
                          onClick={() => setPagar(g)}
                          className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-200"
                        >
                          Pagar
                        </button>
                      )}
                    </div>
                  ) : bloqueado ? (
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
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setAsientoAbierto(asientoAbierto === g.id ? null : g.id)}
                      className="text-xs font-medium text-slate-500 hover:underline"
                    >
                      {asientoAbierto === g.id ? "Ocultar" : "Asiento"}
                    </button>
                    {!bloqueado && (
                      <>
                        <button type="button" onClick={() => editar(g)} className="text-xs font-medium text-[#3F8E91] hover:underline">
                          Editar
                        </button>
                        <button type="button" onClick={() => setQuitar(g)} className="text-xs font-medium text-rose-600 hover:underline">
                          Quitar
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
              {asientoAbierto === g.id && (
                <tr className="bg-slate-50/60">
                  <td colSpan={9} className="px-4 py-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Pre-asiento (vista previa) — {monto(g.monto, g.moneda)}
                    </p>
                    <div className="max-w-xl">
                      <AsientoMini lineas={preAsientoGasto(g, cfgCuentas)} cuentaNombre={cuentaNombre} />
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
          {lista.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                <td colSpan={6} className="px-4 py-2 text-right">
                  {t.totalCosto !== t.total ? "Total (pago, con IVA)" : "Total"}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  {usd(t.total) ?? gs(t.total)}
                  {usd(t.total) && <span className="block text-[11px] font-normal text-slate-500">{gs(t.total)}</span>}
                </td>
                <td colSpan={2} />
              </tr>
              {t.totalCosto !== t.total && (
                <tr className="bg-slate-50 text-slate-600">
                  <td colSpan={6} className="px-4 py-2 text-right">Costo (sin IVA, al costeo)</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-medium">
                    {usd(t.totalCosto) ?? gs(t.totalCosto)}
                    {usd(t.totalCosto) && <span className="block text-[11px] font-normal text-slate-500">{gs(t.totalCosto)}</span>}
                  </td>
                  <td colSpan={2} />
                </tr>
              )}
            </tfoot>
          )}
        </table>
      </div>

      <ConfirmModal
        open={!!quitar}
        title="Quitar gasto"
        message={`¿Quitar "${quitar?.tipo}" por ${quitar ? monto(quitar.monto, quitar.moneda) : ""}?${
          quitar?.libro_compra_id ? " También se anula su factura del Libro de Compras (si tenía pagos, la plata vuelve a la caja/banco)." : ""
        } Queda registrado en el historial.`}
        confirmLabel="Quitar"
        tone="danger"
        onConfirm={() => void confirmarQuitar()}
        onCancel={() => setQuitar(null)}
      />

      {pagar && pagar.libro_compra_id && pagar.factura && (
        <ModalPagoCuota
          compraId={pagar.libro_compra_id}
          cuotaNro={1}
          saldo={pagar.factura.saldo}
          moneda={pagar.moneda}
          titulo={`Pagar ${pagar.tipo}`}
          onClose={() => setPagar(null)}
          onDone={(aviso) => {
            setPagar(null);
            setError(aviso ? `Pago registrado. Ojo: ${aviso}` : null);
            void cargar();
            onCambio?.();
          }}
        />
      )}
    </section>
  );
}
