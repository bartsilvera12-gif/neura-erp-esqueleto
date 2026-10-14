"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AlmacenRow } from "@/lib/inventario/reportes/almacenes-pg";

function nf(v: number) {
  return v.toLocaleString("es-PY");
}

export default function ReporteAlmacenesPage() {
  const [rows, setRows] = useState<AlmacenRow[]>([]);
  const [total, setTotal] = useState<AlmacenRow | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const qs = new URLSearchParams();
      if (desde) qs.set("desde", desde);
      if (hasta) qs.set("hasta", hasta);
      const r = await fetch(`/api/inventario/reportes/almacenes?${qs.toString()}`, { credentials: "include", cache: "no-store" });
      const j = await r.json();
      if (j?.success) {
        setRows((j.data?.rows ?? []) as AlmacenRow[]);
        setTotal((j.data?.total ?? null) as AlmacenRow | null);
      }
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

  useEffect(() => { void cargar(); }, [cargar]);

  const exportUrl = (() => {
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    const s = qs.toString();
    return `/api/inventario/reportes/almacenes/export${s ? `?${s}` : ""}`;
  })();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" style={{ boxShadow: "0 0 0 3px rgba(79,174,178,0.18)" }} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Zentra · Reportes</p>
          </div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Reporte por almacén</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Físico actual, entradas, salidas y ventas por depósito. El físico es al momento; entradas/salidas/vendido respetan el rango de fechas.
          </p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Link href="/inventario/reportes" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50">
            Inventario extendido
          </Link>
          <a
            href={exportUrl}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900 border border-emerald-200 hover:bg-emerald-50 px-3 py-2 rounded-lg transition-colors"
          >
            Exportar Excel
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="zx-surface px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="zx-surface px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20" />
        </div>
        {(desde || hasta) && (
          <button type="button" onClick={() => { setDesde(""); setHasta(""); }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50">
            Limpiar fechas
          </button>
        )}
      </div>

      {total && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Tile label="Depósitos" value={nf(rows.length)} />
          <Tile label="Físico total" value={nf(total.fisico)} accent />
          <Tile label="Entradas" value={nf(total.entradas)} />
          <Tile label="Salidas" value={nf(total.salidas)} />
          <Tile label="Vendido" value={nf(total.vendido)} />
        </div>
      )}

      <div className="zx-surface zx-surface-accent p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="zx-thead text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-2.5 pl-4 pr-4 font-semibold">Almacén</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Productos</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Físico</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Entradas</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Salidas</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Vendido</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Conteo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ubicacion_id ?? r.nombre} className="border-b border-slate-100 last:border-0 transition-colors hover:bg-[#4FAEB2]/[0.05]">
                  <td className="py-3 pl-4 pr-4">
                    <span className="font-medium text-gray-800">{r.nombre}</span>
                    {r.codigo && <span className="ml-2 font-mono text-[11px] text-slate-400">{r.codigo}</span>}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{r.productos}</td>
                  <td className="py-3 pr-4 text-right tabular-nums font-semibold text-slate-800">{r.fisico}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-emerald-700">{r.entradas || <span className="text-slate-300">—</span>}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-red-600">{r.salidas || <span className="text-slate-300">—</span>}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{r.vendido || <span className="text-slate-300">—</span>}</td>
                  <td className="py-3 pr-4 text-right">
                    {r.ubicacion_id ? (
                      <a
                        href={`/api/inventario/reportes/almacenes/${r.ubicacion_id}/imprimir?auto=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        PDF
                      </a>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {total && rows.length > 0 && (
                <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-semibold">
                  <td className="py-3 pl-4 pr-4 text-slate-800">{total.nombre}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-800">{total.productos}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-900">{total.fisico}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-emerald-700">{total.entradas}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-red-600">{total.salidas}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-800">{total.vendido}</td>
                  <td className="py-3 pr-4" />
                </tr>
              )}
              {!cargando && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4">
                    <div className="zx-empty px-6 py-10 text-center">
                      <p className="text-sm text-slate-500">Todavía no hay depósitos cargados.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${accent ? "border-[#4FAEB2]/30 bg-[#4FAEB2]/10" : "border-slate-200 bg-white"}`}>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${accent ? "text-[#3F8E91]" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}
