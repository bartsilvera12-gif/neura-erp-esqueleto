"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

interface Row {
  venta_id: string;
  numero_control: string;
  fecha: string;
  cliente: string | null;
  ruc: string | null;
  moneda: string;
  total: number;
  cobrado: number;
  saldo: number;
  plazo_dias: number | null;
  dias_para_vencer: number | null;
  vencida: boolean;
}

interface Totals {
  cantidad: number;
  total: number;
  saldo: number;
  vencido: number;
  por_vencer: number;
}

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString("es-PY");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const monthAgo = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function CuentasPorCobrarPage() {
  const [desde, setDesde] = useState(monthAgo());
  const [hasta, setHasta] = useState(today());
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (desde) qs.set("desde", desde);
      if (hasta) qs.set("hasta", hasta);
      const r = await fetchWithSupabaseSession(`/api/reportes/cuentas-por-cobrar?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `Error ${r.status}`);
      setRows((j.data?.rows ?? []) as Row[]);
      setTotals((j.data?.totals ?? null) as Totals | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reportes" className="text-xs text-slate-500 hover:text-slate-800">
          Reportes /
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Cuentas por cobrar</h1>
        <p className="mt-1 text-sm text-slate-600">Ventas a crédito con saldo pendiente y estado de vencimiento.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={load}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Aplicar
        </button>
      </div>

      {totals && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi label="Cantidad" value={String(totals.cantidad)} />
          <Kpi label="Saldo total" value={`Gs. ${fmt(totals.saldo)}`} tone="emerald" />
          <Kpi label="Vencido" value={`Gs. ${fmt(totals.vencido)}`} tone="rose" />
          <Kpi label="Por vencer" value={`Gs. ${fmt(totals.por_vencer)}`} tone="amber" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Venta</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">RUC</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Cobrado</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3">Vencimiento</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Sin cuentas por cobrar en el período.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.venta_id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs text-emerald-700">{r.numero_control}</td>
                <td className="px-4 py-3 text-slate-700">{r.fecha.slice(0, 10)}</td>
                <td className="px-4 py-3">{r.cliente ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.ruc ?? "—"}</td>
                <td className="px-4 py-3 text-right">{fmt(r.total)}</td>
                <td className="px-4 py-3 text-right text-emerald-700">{fmt(r.cobrado)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{fmt(r.saldo)}</td>
                <td className="px-4 py-3">
                  {r.dias_para_vencer === null ? (
                    "—"
                  ) : r.vencida ? (
                    <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                      Vencida {Math.abs(r.dias_para_vencer)} d
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                      {r.dias_para_vencer} d
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "emerald" | "rose" | "amber" }) {
  const color = {
    slate: "text-slate-900",
    emerald: "text-emerald-700",
    rose: "text-rose-700",
    amber: "text-amber-700",
  }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}
