"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Importacion, ImportacionCajaMov } from "@/lib/importaciones/types";
import { Aviso, ModalShell, api, btnPrimario, btnSecundario, fechaES, inputClass, jsonInit, labelClass, noRueda, sinFlechas } from "@/components/comex/ui";

const money = (v: number, m: string) => `${m} ${Number(v).toLocaleString("es-PY", { maximumFractionDigits: 2 })}`;

/** Gastos e ingresos de la importación (flete, despacho, seguro…). */
export default function CajaTab({ imp, caja, onCambio }: { imp: Importacion; caja: ImportacionCajaMov[]; onCambio: () => void }) {
  const [modal, setModal] = useState(false);
  const entradas = caja.filter((m) => m.tipo === "entrada").reduce((s, m) => s + Number(m.monto), 0);
  const salidas = caja.filter((m) => m.tipo === "salida").reduce((s, m) => s + Number(m.monto), 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Salidas <strong className="text-rose-700">{money(salidas, imp.moneda)}</strong> · Entradas{" "}
          <strong className="text-emerald-700">{money(entradas, imp.moneda)}</strong>
        </p>
        {imp.estado !== "anulada" && (
          <button onClick={() => setModal(true)} className={btnPrimario}>
            <Plus className="h-3.5 w-3.5" /> Registrar movimiento
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Concepto</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3">Usuario</th>
            </tr>
          </thead>
          <tbody>
            {caja.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  Sin movimientos.
                </td>
              </tr>
            )}
            {caja.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="px-4 py-3 text-slate-700">{fechaES(m.fecha)}</td>
                <td className="px-4 py-3 text-slate-800">
                  {m.concepto}
                  {m.referencia && <span className="ml-1 text-xs text-slate-400">· {m.referencia}</span>}
                </td>
                <td className={`px-4 py-3 text-right font-semibold ${m.tipo === "entrada" ? "text-emerald-700" : "text-rose-700"}`}>
                  {m.tipo === "entrada" ? "+" : "−"}
                  {money(m.monto, m.moneda)}
                </td>
                <td className="px-4 py-3 text-slate-500">{m.usuario_nombre ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <ModalCaja imp={imp} onClose={() => setModal(false)} onSaved={onCambio} />}
    </section>
  );
}

function ModalCaja({ imp, onClose, onSaved }: { imp: Importacion; onClose: () => void; onSaved: () => void }) {
  const [tipo, setTipo] = useState<"entrada" | "salida">("salida");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/importaciones/${imp.id}/caja`, jsonInit("POST", {
        tipo,
        concepto,
        monto: Number(monto),
        moneda: imp.moneda,
        fecha,
        referencia: ref || undefined,
        observacion: obs || undefined,
      }));
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Nuevo movimiento" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as "entrada" | "salida")} className={inputClass}>
              <option value="salida">Salida (gasto)</option>
              <option value="entrada">Entrada</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Concepto *</label>
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} className={inputClass} placeholder="Flete, despacho, seguro…" required />
        </div>
        <div>
          <label className={labelClass}>Monto ({imp.moneda}) *</label>
          <input type="number" step="any" min={0} value={monto} onWheel={noRueda} onChange={(e) => setMonto(e.target.value)} className={`${inputClass} ${sinFlechas}`} required />
        </div>
        <div>
          <label className={labelClass}>Referencia</label>
          <input value={ref} onChange={(e) => setRef(e.target.value)} className={inputClass} maxLength={100} />
        </div>
        <div>
          <label className={labelClass}>Observación</label>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={inputClass} maxLength={500} />
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
