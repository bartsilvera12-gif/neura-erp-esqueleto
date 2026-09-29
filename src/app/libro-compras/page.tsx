"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, Download, Plus, Settings } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { Aviso, api, fechaES, inputClass, labelClass } from "@/components/comex/ui";
import type { TipoComprobante } from "./_components/FormCompra";

type Compra = {
  id: string;
  numero_control: string;
  fecha: string;
  tipo_nombre: string;
  condicion: string;
  nro_comprobante: string;
  proveedor_nombre: string;
  proveedor_ruc: string | null;
  moneda: string;
  total_exentas: number;
  total_gravado10: number;
  total_gravado5: number;
  iva10: number;
  iva5: number;
  total: number;
  es_electronica: boolean;
  estado: "registrada" | "anulada";
};

const primerDiaMes = () => {
  const h = new Date().toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });
  return `${h.slice(0, 8)}01`;
};
const money = (v: number, m: string) => `${m === "PYG" ? "Gs." : m} ${Number(v).toLocaleString("es-PY", { maximumFractionDigits: m === "PYG" ? 0 : 2 })}`;

export default function LibroComprasPage() {
  const [filas, setFilas] = useState<Compra[]>([]);
  const [tipos, setTipos] = useState<TipoComprobante[]>([]);
  const [filtros, setFiltros] = useState({ desde: primerDiaMes(), hasta: "", tipo: "", estado: "", q: "" });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    api<{ tipos: TipoComprobante[] }>("/api/libro-compras/config").then((d) => setTipos(d.tipos)).catch(() => undefined);
  }, []);

  const qs = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)).toString();
  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const d = await api<{ compras: Compra[] }>(`/api/libro-compras?${qs}`);
      setFilas(d.compras);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, [qs]);
  useEffect(() => {
    const t = setTimeout(() => void cargar(), 250);
    return () => clearTimeout(t);
  }, [cargar]);

  async function exportar() {
    setExportando(true);
    try {
      const r = await fetchWithSupabaseSession(`/api/libro-compras/export?${qs}`, { cache: "no-store" });
      if (!r.ok) throw new Error("No se pudo exportar.");
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `libro_compras.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setExportando(false);
    }
  }

  // Totales en guaraníes solo de lo registrado (los anulados no suman).
  const vigentes = filas.filter((f) => f.estado !== "anulada");
  const soloPyg = vigentes.every((f) => f.moneda === "PYG");
  const suma = (k: keyof Compra) => vigentes.reduce((s, f) => s + Number(f[k]), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Compras</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <BookOpen className="h-6 w-6 text-slate-500" /> Libro de compras
          </h1>
          <p className="text-sm text-slate-600">Facturas, recibos y notas de crédito de proveedores, con su IVA y su pre-asiento.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/libro-compras/tipos" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Settings className="h-4 w-4" /> Tipos y cuentas
          </Link>
          <button onClick={() => void exportar()} disabled={exportando} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Download className="h-4 w-4" /> {exportando ? "Exportando…" : "Exportar Excel"}
          </button>
          <Link href="/libro-compras/nuevo" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Registrar comprobante
          </Link>
        </div>
      </header>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className={labelClass}>Desde</label>
          <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Hasta</label>
          <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Tipo</label>
          <select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })} className={inputClass}>
            <option value="">Todos</option>
            {tipos
              .filter((t) => t.uso === "COMPRA")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Estado</label>
          <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })} className={inputClass}>
            <option value="">Todos</option>
            <option value="registrada">Registrados</option>
            <option value="anulada">Anulados</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Buscar</label>
          <input value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} placeholder="Proveedor, RUC o número" className={inputClass} />
        </div>
      </div>

      {error && <Aviso>{error}</Aviso>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Fecha</th>
              <th className="px-3 py-3">Tipo</th>
              <th className="px-3 py-3">N° comprobante</th>
              <th className="px-3 py-3">Proveedor</th>
              <th className="px-3 py-3 text-right">Exentas</th>
              <th className="px-3 py-3 text-right">Gravado 10%</th>
              <th className="px-3 py-3 text-right">IVA 10%</th>
              <th className="px-3 py-3 text-right">Gravado 5%</th>
              <th className="px-3 py-3 text-right">IVA 5%</th>
              <th className="px-3 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {cargando && filas.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && filas.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                  No hay comprobantes en ese período.
                </td>
              </tr>
            )}
            {filas.map((f) => {
              const anulada = f.estado === "anulada";
              const n = (v: number) => (anulada ? <s>{Number(v).toLocaleString("es-PY")}</s> : Number(v).toLocaleString("es-PY"));
              return (
                <tr key={f.id} className={`border-t border-slate-100 hover:bg-slate-50 ${anulada ? "text-slate-400" : ""}`}>
                  <td className="px-3 py-2.5 whitespace-nowrap">{fechaES(f.fecha)}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {f.tipo_nombre}
                    {anulada && <span className="ml-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">ANULADO</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/libro-compras/${f.id}`} className="font-mono text-emerald-700 hover:underline">
                      {f.nro_comprobante}
                    </Link>
                    <div className="text-[11px] text-slate-400">
                      {f.numero_control}
                      {f.es_electronica && " · electrónica"}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {f.proveedor_nombre}
                    {f.proveedor_ruc && <div className="font-mono text-[11px] text-slate-400">{f.proveedor_ruc}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right">{n(f.total_exentas)}</td>
                  <td className="px-3 py-2.5 text-right">{n(f.total_gravado10)}</td>
                  <td className="px-3 py-2.5 text-right">{n(f.iva10)}</td>
                  <td className="px-3 py-2.5 text-right">{n(f.total_gravado5)}</td>
                  <td className="px-3 py-2.5 text-right">{n(f.iva5)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{anulada ? <s>{money(f.total, f.moneda)}</s> : money(f.total, f.moneda)}</td>
                </tr>
              );
            })}
          </tbody>
          {vigentes.length > 0 && soloPyg && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td colSpan={4} className="px-3 py-3 text-right text-xs uppercase text-slate-500">
                  Totales ({vigentes.length} comprobantes)
                </td>
                <td className="px-3 py-3 text-right">{suma("total_exentas").toLocaleString("es-PY")}</td>
                <td className="px-3 py-3 text-right">{suma("total_gravado10").toLocaleString("es-PY")}</td>
                <td className="px-3 py-3 text-right">{suma("iva10").toLocaleString("es-PY")}</td>
                <td className="px-3 py-3 text-right">{suma("total_gravado5").toLocaleString("es-PY")}</td>
                <td className="px-3 py-3 text-right">{suma("iva5").toLocaleString("es-PY")}</td>
                <td className="px-3 py-3 text-right">Gs. {suma("total").toLocaleString("es-PY")}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
