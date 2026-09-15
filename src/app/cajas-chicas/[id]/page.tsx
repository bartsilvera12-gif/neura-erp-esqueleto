"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Tipo = "aporte" | "gasto" | "retiro" | "ajuste" | "saldo_inicial";

const TIPO_LABEL: Record<Tipo, string> = {
  aporte: "Aporte",
  gasto: "Gasto",
  retiro: "Retiro",
  ajuste: "Ajuste",
  saldo_inicial: "Saldo inicial",
};

const TIPO_BADGE: Record<Tipo, string> = {
  aporte: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  gasto: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  retiro: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  ajuste: "bg-slate-50 text-slate-600 ring-1 ring-slate-200",
  saldo_inicial: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
};

type Movimiento = {
  id: string;
  tipo: Tipo;
  monto: number;
  fecha: string;
  referencia: string | null;
  observacion: string | null;
  usuario_nombre: string | null;
  created_at: string;
};

type Caja = {
  id: string;
  nombre: string;
  moneda: string;
  tope_gasto: number | null;
  saldo_actual: number;
  sucursal_id: string | null;
};

function formatMonto(v: number, moneda: string) {
  const val = Math.round(v).toLocaleString("es-PY");
  return moneda === "USD" ? `USD ${val}` : `Gs. ${val}`;
}

function signo(t: Tipo, monto: number) {
  if (t === "aporte" || t === "saldo_inicial") return monto;
  if (t === "gasto" || t === "retiro") return -monto;
  return monto; // ajuste
}

export default function CajaChicaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [caja, setCaja] = useState<Caja | null>(null);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rC, rM] = await Promise.all([
        fetchWithSupabaseSession("/api/cajas-chicas", { cache: "no-store" }),
        fetchWithSupabaseSession(`/api/cajas-chicas/${id}/movimientos`, { cache: "no-store" }),
      ]);
      const jC = await rC.json();
      const jM = await rM.json();
      if (!rC.ok) throw new Error(jC?.error ?? `Error ${rC.status}`);
      if (!rM.ok) throw new Error(jM?.error ?? `Error ${rM.status}`);
      const cajas = (jC.data?.cajas ?? []) as Caja[];
      setCaja(cajas.find((c) => c.id === id) ?? null);
      setMovs((jM.data?.movimientos ?? []) as Movimiento[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <Link
        href="/cajas-chicas"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Cajas chicas
      </Link>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading && <p className="text-sm text-slate-500">Cargando…</p>}

      {caja && (
        <>
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Zentra · Finanzas
              </p>
              <h1 className="text-2xl font-semibold text-slate-900">{caja.nombre}</h1>
              <p className="text-sm text-slate-600">
                Saldo actual:{" "}
                <span className={`font-semibold ${caja.saldo_actual < 0 ? "text-rose-700" : "text-slate-900"}`}>
                  {formatMonto(caja.saldo_actual, caja.moneda)}
                </span>
                {caja.tope_gasto ? ` · tope por gasto ${formatMonto(caja.tope_gasto, caja.moneda)}` : ""}
              </p>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" /> Nuevo movimiento
            </button>
          </header>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Referencia</th>
                  <th className="px-4 py-3">Observación</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {movs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Sin movimientos.
                    </td>
                  </tr>
                )}
                {movs.map((m) => {
                  const signed = signo(m.tipo, Number(m.monto));
                  return (
                    <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{m.fecha}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TIPO_BADGE[m.tipo]}`}>
                          {TIPO_LABEL[m.tipo]}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{m.referencia ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{m.observacion ?? "—"}</td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          signed < 0 ? "text-rose-700" : "text-emerald-700"
                        }`}
                      >
                        {signed >= 0 ? "+" : ""}
                        {formatMonto(signed, caja.moneda)}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{m.usuario_nombre ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalOpen && caja && (
        <NuevoMovimientoModal caja={caja} onClose={() => setModalOpen(false)} onSaved={load} />
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

function NuevoMovimientoModal({
  caja,
  onClose,
  onSaved,
}: {
  caja: Caja;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<Tipo>("gasto");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [referencia, setReferencia] = useState("");
  const [observacion, setObservacion] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const montoN = Number(monto);
      if (tipo === "gasto" && caja.tope_gasto && montoN > caja.tope_gasto) {
        throw new Error(
          `El gasto supera el tope de caja chica (${caja.tope_gasto}). Manejalo como fondo de proyecto.`,
        );
      }
      const r = await fetchWithSupabaseSession(`/api/cajas-chicas/${caja.id}/movimientos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tipo,
          monto: montoN,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Nuevo movimiento</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4 px-5 py-4">
          <div>
            <label className={labelClass}>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)} className={inputClass}>
              <option value="aporte">Aporte</option>
              <option value="gasto">Gasto</option>
              <option value="retiro">Retiro</option>
              <option value="ajuste">Ajuste</option>
              <option value="saldo_inicial">Saldo inicial</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Monto *</label>
              <input
                type="number"
                step="any"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Referencia</label>
            <input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              className={inputClass}
              maxLength={100}
            />
          </div>
          <div>
            <label className={labelClass}>Observación</label>
            <textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              className={inputClass}
              rows={2}
              maxLength={500}
            />
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
