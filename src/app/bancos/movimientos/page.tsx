"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { Landmark, Plus, X } from "lucide-react";

type Entidad = { id: string; nombre: string; tipo: string };

type Movimiento = {
  id: string;
  entidad_bancaria_id: string;
  tipo: "retiro" | "deposito" | "transferencia_in" | "transferencia_out" | "ajuste";
  monto: number;
  moneda: string;
  fecha: string;
  referencia: string | null;
  observacion: string | null;
  entidad_contraparte_id: string | null;
  usuario_nombre: string | null;
  created_at: string;
};

const TIPO_LABEL: Record<Movimiento["tipo"], string> = {
  retiro: "Retiro",
  deposito: "Depósito",
  transferencia_in: "Transferencia (entrada)",
  transferencia_out: "Transferencia (salida)",
  ajuste: "Ajuste",
};
const TIPO_BADGE: Record<Movimiento["tipo"], string> = {
  retiro: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  deposito: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  transferencia_in: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  transferencia_out: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  ajuste: "bg-slate-50 text-slate-600 ring-1 ring-slate-200",
};

function formatGs(v: number) {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}
function formatFecha(iso: string) {
  return iso ? new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("es-PY") : "";
}

export default function MovimientosBancariosPage() {
  const [entidades, setEntidades] = useState<Entidad[]>([]);
  const [rows, setRows] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rEnt, rMov] = await Promise.all([
        fetchWithSupabaseSession("/api/entidades-bancarias?todas=1", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/bancos/movimientos", { cache: "no-store" }),
      ]);
      const jEnt = await rEnt.json();
      const jMov = await rMov.json();
      if (!rEnt.ok) throw new Error(jEnt?.error ?? `Error ${rEnt.status}`);
      if (!rMov.ok) throw new Error(jMov?.error ?? `Error ${rMov.status}`);
      setEntidades(((jEnt.data?.entidades ?? []) as Entidad[]).filter((e) => e.tipo === "banco" || e.tipo === "caja"));
      setRows((jMov.data?.movimientos ?? []) as Movimiento[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const entidadNombre = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of entidades) m[e.id] = e.nombre;
    return m;
  }, [entidades]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Finanzas</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Landmark className="h-6 w-6 text-slate-500" /> Movimientos bancarios
          </h1>
          <p className="text-sm text-slate-600">
            Retiros, depósitos, transferencias y ajustes por entidad bancaria.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> Nuevo movimiento
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
              <th className="px-4 py-3">Entidad</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Referencia</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3">Usuario</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Sin movimientos.
                </td>
              </tr>
            )}
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-700">{formatFecha(m.fecha)}</td>
                <td className="px-4 py-3 text-slate-800">{entidadNombre[m.entidad_bancaria_id] ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TIPO_BADGE[m.tipo]}`}>
                    {TIPO_LABEL[m.tipo]}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{m.referencia ?? "—"}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatGs(Number(m.monto))}</td>
                <td className="px-4 py-3 text-slate-500">{m.usuario_nombre ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <NuevoMovimientoModal entidades={entidades} onClose={() => setModalOpen(false)} onSaved={load} />
      )}
    </div>
  );
}

function NuevoMovimientoModal({
  entidades,
  onClose,
  onSaved,
}: {
  entidades: Entidad[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<Movimiento["tipo"]>("retiro");
  const [entidadId, setEntidadId] = useState("");
  const [contraparteId, setContraparteId] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [referencia, setReferencia] = useState("");
  const [observacion, setObservacion] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiereContraparte = tipo === "transferencia_in" || tipo === "transferencia_out";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!entidadId || !(Number(monto) > 0)) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/bancos/movimientos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tipo,
          entidad_bancaria_id: entidadId,
          entidad_contraparte_id: requiereContraparte ? contraparteId || null : null,
          monto: Number(monto),
          fecha,
          referencia: referencia.trim() || undefined,
          observacion: observacion.trim() || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `Error ${r.status}`);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Nuevo movimiento bancario</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as Movimiento["tipo"])} className={inputClass}>
              <option value="retiro">Retiro</option>
              <option value="deposito">Depósito</option>
              <option value="transferencia_out">Transferencia (salida)</option>
              <option value="transferencia_in">Transferencia (entrada)</option>
              <option value="ajuste">Ajuste</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Entidad</label>
            <select value={entidadId} onChange={(e) => setEntidadId(e.target.value)} className={inputClass} required>
              <option value="">Seleccionar…</option>
              {entidades.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </div>

          {requiereContraparte && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Contraparte
              </label>
              <select value={contraparteId} onChange={(e) => setContraparteId(e.target.value)} className={inputClass}>
                <option value="">— Sin especificar —</option>
                {entidades.filter((x) => x.id !== entidadId).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Monto</label>
              <input
                type="number"
                min={0}
                step="any"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Referencia (nº operación, cheque…)
            </label>
            <input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              className={inputClass}
              maxLength={100}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Observación
            </label>
            <textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              rows={2}
              className={inputClass}
              maxLength={500}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
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
