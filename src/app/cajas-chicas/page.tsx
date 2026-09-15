"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { PiggyBank, Plus, X } from "lucide-react";

type Sucursal = { id: string; nombre: string; codigo: string; activa: boolean; es_principal: boolean };
type Caja = {
  id: string;
  sucursal_id: string | null;
  nombre: string;
  moneda: string;
  tope_gasto: number | null;
  activa: boolean;
  saldo_actual: number;
};

function formatMonto(v: number, moneda: string) {
  const val = Math.round(v).toLocaleString("es-PY");
  return moneda === "USD" ? `USD ${val}` : `Gs. ${val}`;
}

export default function CajasChicasPage() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevaCajaOpen, setNuevaCajaOpen] = useState(false);
  const [nuevaSucOpen, setNuevaSucOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rS, rC] = await Promise.all([
        fetchWithSupabaseSession("/api/sucursales", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/cajas-chicas", { cache: "no-store" }),
      ]);
      const jS = await rS.json();
      const jC = await rC.json();
      if (!rS.ok) throw new Error(jS?.error ?? `Error ${rS.status}`);
      if (!rC.ok) throw new Error(jC?.error ?? `Error ${rC.status}`);
      setSucursales((jS.data?.sucursales ?? []) as Sucursal[]);
      setCajas((jC.data?.cajas ?? []) as Caja[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nombrePorSucursal = new Map(sucursales.map((s) => [s.id, s.nombre]));

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Finanzas</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <PiggyBank className="h-6 w-6 text-slate-500" /> Cajas chicas por local
          </h1>
          <p className="text-sm text-slate-600">
            Cada sucursal tiene su caja chica. El saldo es aportes − gastos − retiros ± ajustes.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setNuevaSucOpen(true)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            + Sucursal
          </button>
          <button
            onClick={() => setNuevaCajaOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" /> Nueva caja chica
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : cajas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
          Todavía no hay cajas chicas. Creá una para arrancar.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cajas.map((c) => (
            <Link
              key={c.id}
              href={`/cajas-chicas/${c.id}`}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
            >
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <div className="text-base font-semibold text-slate-900">{c.nombre}</div>
                  <div className="text-xs text-slate-500">
                    {c.sucursal_id ? nombrePorSucursal.get(c.sucursal_id) ?? "—" : "Sin sucursal"}
                  </div>
                </div>
                {c.activa ? (
                  <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    Activa
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
                    Inactiva
                  </span>
                )}
              </div>
              <div className="mt-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Saldo</p>
                <p className={`mt-1 text-xl font-bold ${c.saldo_actual < 0 ? "text-rose-700" : "text-slate-900"}`}>
                  {formatMonto(c.saldo_actual, c.moneda)}
                </p>
                {c.tope_gasto && (
                  <p className="mt-1 text-xs text-slate-500">
                    Tope por gasto: {formatMonto(c.tope_gasto, c.moneda)}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {nuevaCajaOpen && (
        <NuevaCajaModal sucursales={sucursales} onClose={() => setNuevaCajaOpen(false)} onSaved={load} />
      )}
      {nuevaSucOpen && <NuevaSucursalModal onClose={() => setNuevaSucOpen(false)} onSaved={load} />}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function NuevaCajaModal({
  sucursales,
  onClose,
  onSaved,
}: {
  sucursales: Sucursal[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [moneda, setMoneda] = useState("PYG");
  const [tope, setTope] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/cajas-chicas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nombre,
          sucursal_id: sucursalId || null,
          moneda,
          tope_gasto: tope ? Number(tope) : null,
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

  return (
    <ModalShell title="Nueva caja chica" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelClass}>Nombre *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} required />
        </div>
        <div>
          <label className={labelClass}>Sucursal</label>
          <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} className={inputClass}>
            <option value="">— Sin asignar —</option>
            {sucursales.filter((s) => s.activa).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Moneda</label>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={inputClass}>
              <option value="PYG">PYG</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Tope por gasto (opcional)</label>
            <input
              type="number"
              min={0}
              step="any"
              value={tope}
              onChange={(e) => setTope(e.target.value)}
              className={inputClass}
              placeholder="Sin tope"
            />
          </div>
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
            {saving ? "Guardando…" : "Crear"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function NuevaSucursalModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [esPrincipal, setEsPrincipal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/sucursales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ codigo, nombre, es_principal: esPrincipal }),
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

  return (
    <ModalShell title="Nueva sucursal" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelClass}>Código *</label>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} className={inputClass} required />
        </div>
        <div>
          <label className={labelClass}>Nombre *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} required />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={esPrincipal} onChange={(e) => setEsPrincipal(e.target.checked)} />
          Marcar como principal
        </label>
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
            {saving ? "Guardando…" : "Crear"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
