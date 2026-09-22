"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AUTOIMPRESOR_DEFAULT } from "@/lib/facturas-exportacion/config";
import type { FacturaExportacion, FacturaExportacionEstado } from "@/lib/facturas-exportacion/types";

export const dynamic = "force-dynamic";

function fmt(n: number, m: string) {
  const s = Number(n || 0).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${m} ${s}`;
}
function fechaES(iso: string) {
  const [y, mo, d] = iso.slice(0, 10).split("-");
  return `${d}/${mo}/${y}`;
}

export default function FacturasExportacionPage() {
  const [filas, setFilas] = useState<FacturaExportacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState<"" | FacturaExportacionEstado>("");
  const [punto, setPunto] = useState<"" | string>("");
  const [q, setQ] = useState("");

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      if (estado) params.set("estado", estado);
      if (punto) params.set("punto", punto);
      if (q) params.set("q", q);
      const res = await fetch(`/api/facturas-exportacion?${params}`, { credentials: "include", cache: "no-store" });
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Error");
      setFilas(j.data?.facturas ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { void cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function anular(f: FacturaExportacion) {
    const motivo = window.prompt(`Anular ${f.numero_formateado}. Motivo:`);
    if (!motivo || !motivo.trim()) return;
    const res = await fetch(`/api/facturas-exportacion/${f.id}/anular`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ motivo: motivo.trim() }),
    });
    const j = await res.json();
    if (!res.ok || !j?.success) {
      alert(j?.error ?? "No se pudo anular.");
      return;
    }
    void cargar();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Zentra · Autoimpresor
          </p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Facturas de Exportación</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Timbrado {AUTOIMPRESOR_DEFAULT.timbrado} · vigencia 03/08/2026 al 31/08/2027 · puntos{" "}
            {AUTOIMPRESOR_DEFAULT.puntos.join(" / ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/facturas-exportacion/regularizacion"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Regularización
          </Link>
          <Link
            href="/facturas-exportacion/nueva"
            className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91]"
          >
            + Nueva factura
          </Link>
        </div>
      </div>

      <div className="zx-surface zx-surface-accent p-6">
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Estado</label>
            <select value={estado} onChange={(e) => setEstado(e.target.value as "" | FacturaExportacionEstado)} className="zx-surface w-full px-3 py-2 text-sm">
              <option value="">Todos</option>
              <option value="EMITIDA">Emitidas</option>
              <option value="ANULADA">Anuladas</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Punto</label>
            <select value={punto} onChange={(e) => setPunto(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm">
              <option value="">Todos</option>
              {AUTOIMPRESOR_DEFAULT.puntos.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Cliente</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre…" className="zx-surface w-full px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mb-4 flex gap-2">
          <button onClick={() => void cargar()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
            Aplicar filtros
          </button>
          <button
            onClick={() => { setDesde(""); setHasta(""); setEstado(""); setPunto(""); setQ(""); setTimeout(cargar, 0); }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
          >
            Limpiar
          </button>
        </div>

        {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Número</th>
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Cliente</th>
                <th className="py-2 pr-3">País</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Emitida por</th>
                <th className="py-2 pr-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr><td colSpan={8} className="py-8 text-center text-slate-400">Cargando…</td></tr>
              )}
              {!cargando && filas.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-slate-400">No hay facturas con esos filtros.</td></tr>
              )}
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                  <td className="py-2 pr-3 font-mono text-slate-800">
                    {f.numero_formateado}
                    {f.regularizacion && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Reg.</span>}
                  </td>
                  <td className="py-2 pr-3">{fechaES(f.fecha)}</td>
                  <td className="py-2 pr-3">{f.cliente_nombre}</td>
                  <td className="py-2 pr-3">{f.cliente_pais}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt(f.total, f.moneda)}</td>
                  <td className="py-2 pr-3">
                    {f.estado === "ANULADA" ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Anulada</span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Emitida</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-500">{f.created_by_nombre ?? "—"}</td>
                  <td className="py-2 pr-3 text-right">
                    <div className="inline-flex gap-2">
                      <a
                        href={`/api/facturas-exportacion/${f.id}/pdf`}
                        target="_blank"
                        rel="noopener"
                        className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        PDF
                      </a>
                      {f.estado === "EMITIDA" && (
                        <button
                          onClick={() => anular(f)}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Anular
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
