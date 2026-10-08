"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Plus } from "lucide-react";
import type { ImportacionCajaMov } from "@/lib/importaciones/types";
import { movimientoEnGuaranies, resumenCaja } from "@/lib/importaciones/caja";
import {
  Aviso,
  ModalShell,
  api,
  btnPrimario,
  btnSecundario,
  fechaES,
  hoyPY,
  inputClass,
  jsonInit,
  labelClass,
  noRueda,
  sinFlechas,
} from "@/components/comex/ui";

const MONEDAS = ["USD", "BOB", "PYG"];
const gs = (n: number) => `Gs. ${Math.round(Number(n) || 0).toLocaleString("es-PY")}`;
const enGs = (m: ImportacionCajaMov) => movimientoEnGuaranies(m);
const montoMoneda = (m: Pick<ImportacionCajaMov, "monto" | "moneda">) =>
  `${Number(m.monto).toLocaleString("es-PY", { maximumFractionDigits: 2 })} ${m.moneda}`;

/**
 * Movimientos de plata de la importación: lo que se pagó (salidas) y lo que
 * entró (entradas), con el saldo en guaraníes. Se carga sobre la API que ya
 * existía; solo faltaba la pantalla.
 */
export default function CajaTab({
  impId,
  moneda,
  bloqueado,
  onCambio,
}: {
  impId: string;
  moneda: string;
  bloqueado?: boolean;
  onCambio?: () => void;
}) {
  const [movs, setMovs] = useState<ImportacionCajaMov[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await api<{ movimientos: ImportacionCajaMov[] }>(`/api/importaciones/${impId}/caja`);
      setMovs(r.movimientos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [impId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (!movs) return <p className="text-sm text-slate-500">Cargando…</p>;

  const { entradas, salidas, saldo } = resumenCaja(movs);

  return (
    <section className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className={labelClass}>Entradas</p>
          <p className="text-xl font-semibold text-emerald-700">{gs(entradas)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className={labelClass}>Salidas</p>
          <p className="text-xl font-semibold text-rose-700">{gs(salidas)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <p className={labelClass}>Saldo</p>
          <p className={`text-xl font-semibold ${saldo < 0 ? "text-rose-700" : "text-slate-900"}`}>{gs(saldo)}</p>
        </div>
      </div>

      {error && <Aviso>{error}</Aviso>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Pagos y cobros de esta importación. Los montos se llevan a guaraníes con su tipo de cambio.</p>
        {!bloqueado && (
          <button onClick={() => setModal(true)} className={btnPrimario}>
            <Plus className="h-3.5 w-3.5" /> Registrar movimiento
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Concepto</th>
              <th className="px-4 py-2 text-right">Monto</th>
              <th className="px-4 py-2 text-right">En Gs.</th>
              <th className="px-4 py-2">Referencia</th>
              <th className="px-4 py-2">Usuario</th>
            </tr>
          </thead>
          <tbody>
            {movs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                  Todavía no hay movimientos.
                </td>
              </tr>
            )}
            {movs.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{fechaES(m.fecha)}</td>
                <td className="px-4 py-2">
                  {m.tipo === "entrada" ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <ArrowDownCircle className="h-3.5 w-3.5" /> Entrada
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-rose-700">
                      <ArrowUpCircle className="h-3.5 w-3.5" /> Salida
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-800">
                  {m.concepto}
                  {m.observacion && <span className="block text-[11px] text-slate-500">{m.observacion}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-slate-700">{montoMoneda(m)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-slate-700">{gs(enGs(m))}</td>
                <td className="px-4 py-2 text-slate-600">{m.referencia || "—"}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{m.usuario_nombre || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <ModalMovimiento
          impId={impId}
          monedaDefault={moneda}
          onClose={() => setModal(false)}
          onSaved={() => {
            setModal(false);
            void cargar();
            onCambio?.();
          }}
        />
      )}
    </section>
  );
}

function ModalMovimiento({
  impId,
  monedaDefault,
  onClose,
  onSaved,
}: {
  impId: string;
  monedaDefault: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<"entrada" | "salida">("salida");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState(MONEDAS.includes(monedaDefault) ? monedaDefault : "USD");
  const [tipoCambio, setTipoCambio] = useState("");
  const [fecha, setFecha] = useState(hoyPY());
  const [referencia, setReferencia] = useState("");
  const [observacion, setObservacion] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const num = `${inputClass} ${sinFlechas}`;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!concepto.trim()) return setError("Escribí el concepto.");
    if (!(Number(monto) > 0)) return setError("El monto tiene que ser mayor a 0.");
    if (moneda !== "PYG" && !(Number(tipoCambio) > 0)) return setError("Cargá el tipo de cambio a guaraníes.");
    setSaving(true);
    setError(null);
    try {
      await api(
        `/api/importaciones/${impId}/caja`,
        jsonInit("POST", {
          tipo,
          concepto: concepto.trim(),
          monto: Number(monto),
          moneda,
          tipo_cambio: moneda === "PYG" ? 1 : Number(tipoCambio),
          fecha,
          referencia: referencia.trim() || null,
          observacion: observacion.trim() || null,
        })
      );
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Registrar movimiento de caja" onClose={onClose}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as "entrada" | "salida")} className={inputClass}>
              <option value="salida">Salida (pago)</option>
              <option value="entrada">Entrada (cobro)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Concepto *</label>
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} className={inputClass} placeholder="Ej.: Pago al proveedor, seña, flete" autoFocus />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Monto *</label>
            <input type="number" step="any" min={0} value={monto} onWheel={noRueda} onChange={(e) => setMonto(e.target.value)} className={num} />
          </div>
          <div>
            <label className={labelClass}>Moneda</label>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={inputClass}>
              {MONEDAS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          {moneda !== "PYG" && (
            <div>
              <label className={labelClass}>Cambio a Gs.</label>
              <input type="number" step="any" min={0} value={tipoCambio} onWheel={noRueda} onChange={(e) => setTipoCambio(e.target.value)} className={num} />
            </div>
          )}
        </div>
        <div>
          <label className={labelClass}>Referencia</label>
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className={inputClass} placeholder="Ej.: Nº de transferencia o recibo" />
        </div>
        <div>
          <label className={labelClass}>Observación</label>
          <input value={observacion} onChange={(e) => setObservacion(e.target.value)} className={inputClass} />
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={saving} className={btnPrimario}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
