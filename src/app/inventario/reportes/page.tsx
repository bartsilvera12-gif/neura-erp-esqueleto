"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import type { ExtendidoRow, ExtendidoTotals } from "@/lib/inventario/reportes/extendido-pg";

function nf(v: number) {
  return v.toLocaleString("es-PY");
}

export default function ReportesInventarioPage() {
  const [rows, setRows] = useState<ExtendidoRow[]>([]);
  const [totals, setTotals] = useState<ExtendidoTotals | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancel = false;
    fetch("/api/inventario/reportes/extendido", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel || !j?.success) return;
        setRows((j.data?.rows ?? []) as ExtendidoRow[]);
        setTotals((j.data?.totals ?? null) as ExtendidoTotals | null);
      })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, []);

  const filtradas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => `${r.nombre} ${r.sku}`.toLowerCase().includes(t));
  }, [rows, busqueda]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" style={{ boxShadow: "0 0 0 3px rgba(79,174,178,0.18)" }} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Zentra · Reportes</p>
          </div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Inventario extendido</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Importado, vendido, show room y exportación a Bolivia por producto. Saldo = importación − vendido − exportación Bolivia.
          </p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Link
            href="/inventario"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            ← Inventario
          </Link>
          <Link
            href="/inventario/reportes/almacenes"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Por almacén
          </Link>
          <ExportExcelButton url="/api/inventario/reportes/extendido/export" />
          <button
            type="button"
            onClick={() => {
              const qs = busqueda.trim() ? `?buscar=${encodeURIComponent(busqueda.trim())}&auto=1` : "?auto=1";
              window.open(`/api/inventario/reportes/extendido/imprimir${qs}`, "_blank", "noopener");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Imprimir PDF
          </button>
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="Productos" value={nf(totals.productos)} />
          <Tile label="Importado" value={nf(totals.cantidad_importacion)} />
          <Tile label="Vendido" value={nf(totals.vendido)} />
          <Tile label="Show room" value={nf(totals.show_room)} />
          <Tile label="Exp. Bolivia" value={nf(totals.exportacion_bolivia)} />
          <Tile label="Saldo" value={nf(totals.saldo)} accent />
        </div>
      )}

      <div className="zx-surface zx-surface-accent p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[16rem] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Buscar</label>
            <input
              type="text"
              placeholder="Nombre o SKU…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="zx-surface w-full px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
            />
          </div>
          <span className="text-xs text-slate-500">
            {filtradas.length === rows.length ? `${rows.length} productos` : `${filtradas.length} de ${rows.length} productos`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="zx-thead text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-2.5 pl-4 pr-4 font-semibold">Producto</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Importado</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Vendido</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Show room</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Exp. BOL</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Stock</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((r) => (
                <tr key={r.sku} className="border-b border-slate-100 last:border-0 transition-colors hover:bg-[#4FAEB2]/[0.05]">
                  <td className="py-3 pl-4 pr-4">
                    <div className="font-medium leading-snug text-gray-800">{r.nombre}</div>
                    <p className="font-mono text-[11px] text-slate-400">{r.sku}</p>
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{r.cantidad_importacion || <span className="text-slate-300">—</span>}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{r.vendido || <span className="text-slate-300">—</span>}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{r.show_room || <span className="text-slate-300">—</span>}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{r.exportacion_bolivia || <span className="text-slate-300">—</span>}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{r.stock_actual}</td>
                  <td className="py-3 pr-4 text-right tabular-nums font-semibold text-slate-800">{r.saldo}</td>
                </tr>
              ))}
              {!cargando && filtradas.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4">
                    <div className="zx-empty px-6 py-10 text-center">
                      <p className="text-sm text-slate-500">
                        {rows.length === 0 ? "Todavía no hay productos." : "Ningún producto coincide con la búsqueda."}
                      </p>
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
