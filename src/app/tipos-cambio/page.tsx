"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { Coins, Plus, X } from "lucide-react";

type Tasa = {
  id: string;
  fecha: string;
  moneda_origen: string;
  moneda_destino: string;
  tasa: number;
  observacion: string | null;
  created_at: string;
};

const MONEDAS = ["PYG", "USD", "BOB"] as const;

export default function TiposCambioPage() {
  const [rows, setRows] = useState<Tasa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Tasa | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/tipos-cambio", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `Error ${r.status}`);
      setRows((j.data?.tasas ?? []) as Tasa[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Finanzas</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Coins className="h-6 w-6 text-slate-500" /> Tipos de cambio
          </h1>
          <p className="text-sm text-slate-600">
            Tasas diarias para conversiones (PYG · USD · BOB). Compras, gastos y movimientos bancarios en
            moneda extranjera usan la tasa del día.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> Nueva tasa
        </button>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Par</th>
              <th className="px-4 py-3 text-right">Tasa</th>
              <th className="px-4 py-3">Observación</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Todavía no hay tasas cargadas.
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-700">{t.fecha}</td>
                <td className="px-4 py-3 font-mono text-slate-700">
                  1 {t.moneda_origen} → {t.moneda_destino}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">
                  {Number(t.tasa).toLocaleString("es-PY")}
                </td>
                <td className="px-4 py-3 text-slate-500">{t.observacion ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditing(t)}
                      className="text-xs font-medium text-sky-700 hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`¿Eliminar la tasa ${t.moneda_origen} → ${t.moneda_destino} del ${t.fecha}?`)) return;
                        const r = await fetchWithSupabaseSession(`/api/tipos-cambio/${t.id}`, { method: "DELETE" });
                        const j = await r.json().catch(() => ({}));
                        if (r.ok && (j as { success?: boolean })?.success !== false) load();
                        else window.alert((j as { error?: string })?.error ?? "No se pudo eliminar.");
                      }}
                      className="text-xs font-medium text-rose-600 hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && <NuevaTasaModal onClose={() => setModalOpen(false)} onSaved={load} />}
      {editing && <NuevaTasaModal initial={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

function NuevaTasaModal({
  onClose,
  onSaved,
  initial,
}: {
  onClose: () => void;
  onSaved: () => void;
  initial?: Tasa;
}) {
  const [fecha, setFecha] = useState(initial?.fecha ?? new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState(initial?.moneda_origen ?? "USD");
  const [to, setTo] = useState(initial?.moneda_destino ?? "PYG");
  const [tasa, setTasa] = useState(initial ? String(initial.tasa) : "");
  const [obs, setObs] = useState(initial?.observacion ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!initial;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(
        isEdit ? `/api/tipos-cambio/${initial.id}` : "/api/tipos-cambio",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fecha,
            moneda_origen: from,
            moneda_destino: to,
            tasa: Number(tasa),
            observacion: obs.trim() || undefined,
          }),
        },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `Error ${r.status}`);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{isEdit ? "Editar tasa" : "Nueva tasa"}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Origen</label>
              <select value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass}>
                {MONEDAS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Destino</label>
              <select value={to} onChange={(e) => setTo(e.target.value)} className={inputClass}>
                {MONEDAS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Tasa (1 {from} = X {to})</label>
            <input
              type="number"
              step="any"
              min={0}
              value={tasa}
              onChange={(e) => setTasa(e.target.value)}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Observación</label>
            <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputClass} maxLength={300} />
          </div>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
