"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type ProyectoFondo = {
  id: string;
  titulo: string;
  monto_vendido: number;
  total_gastado: number;
  saldo: number;
};

function formatGs(v: number) {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}

export default function FondosPorProyectoPage() {
  const [rows, setRows] = useState<ProyectoFondo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetchWithSupabaseSession("/api/proyectos/fondos", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (cancel) return;
        if (!r.ok || !j?.success) {
          setError(j?.error ?? `Error ${r.status}`);
          return;
        }
        setRows((j.data?.proyectos ?? []) as ProyectoFondo[]);
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : "Error de red");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const totalPresupuesto = rows.reduce((s, r) => s + r.monto_vendido, 0);
  const totalGastado = rows.reduce((s, r) => s + r.total_gastado, 0);
  const saldoTotal = totalPresupuesto - totalGastado;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/proyectos"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Proyectos
      </Link>

      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Proyectos</p>
        <h1 className="text-2xl font-semibold text-slate-900">Fondos por proyecto</h1>
        <p className="text-sm text-slate-600">
          Cuando un gasto excede la caja chica, imputalo a un proyecto y controlá el saldo disponible.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Presupuesto total</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">{formatGs(totalPresupuesto)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Gastado</p>
          <p className="mt-1 text-lg font-semibold text-rose-600">{formatGs(totalGastado)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Saldo</p>
          <p className={`mt-1 text-lg font-semibold ${saldoTotal < 0 ? "text-rose-700" : "text-emerald-700"}`}>
            {formatGs(saldoTotal)}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Proyecto</th>
              <th className="px-4 py-3 text-right">Presupuesto</th>
              <th className="px-4 py-3 text-right">Gastado</th>
              <th className="px-4 py-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No hay proyectos activos.
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-800">{p.titulo}</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatGs(p.monto_vendido)}</td>
                <td className="px-4 py-3 text-right text-rose-600">{formatGs(p.total_gastado)}</td>
                <td
                  className={`px-4 py-3 text-right font-semibold ${
                    p.saldo < 0 ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  {formatGs(p.saldo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
