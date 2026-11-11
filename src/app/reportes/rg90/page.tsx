"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, Download, AlertTriangle, CheckCircle2, Filter } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Fila = {
  tipo_registro: "COMPRAS" | "VENTAS";
  fecha: string;
  tipo_comprobante: string;
  timbrado: string;
  numero: string;
  ruc: string;
  nombre: string;
  moneda: string;
  total: number;
  gravado_10: number;
  gravado_5: number;
  exento: number;
  errores: string[];
  id_interno: string;
  seccion: string | null;
};
type Previa = {
  informante: { ruc: string; nombre: string };
  totales: { compras: number; ventas: number; gravado_10: number; iva_10: number; gravado_5: number; iva_5: number; exento: number };
  comprobantes_con_errores: number;
  total_filas: number;
  filas: Fila[];
};

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString("es-PY");

/** Primer y último día del mes de una fecha YYYY-MM. */
function rangoMes(ym: string): { desde: string; hasta: string } {
  const [y, m] = ym.split("-").map(Number);
  const desde = `${y}-${String(m).padStart(2, "0")}-01`;
  const ultimoDia = new Date(y, m, 0).getDate();
  const hasta = `${y}-${String(m).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  return { desde, hasta };
}
function mesActualYM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function Rg90Page() {
  const [modo, setModo] = useState<"mes" | "rango">("mes");
  const [mes, setMes] = useState<string>(mesActualYM());
  const [desde, setDesde] = useState<string>(rangoMes(mesActualYM()).desde);
  const [hasta, setHasta] = useState<string>(rangoMes(mesActualYM()).hasta);
  const [incluyeCompras, setIncluyeCompras] = useState(true);
  const [incluyeVentas, setIncluyeVentas] = useState(true);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soloErrores, setSoloErrores] = useState(false);
  const [bajando, setBajando] = useState(false);

  const filtros = useMemo(() => {
    const rango = modo === "mes" ? rangoMes(mes) : { desde, hasta };
    const tipos = [incluyeCompras ? "COMPRAS" : "", incluyeVentas ? "VENTAS" : ""].filter(Boolean).join(",");
    return { ...rango, tipos };
  }, [modo, mes, desde, hasta, incluyeCompras, incluyeVentas]);

  const buscar = useCallback(async () => {
    if (!filtros.tipos) { setError("Elegí al menos COMPRAS o VENTAS."); return; }
    setCargando(true); setError(null); setPrevia(null);
    try {
      const qs = new URLSearchParams({ desde: filtros.desde, hasta: filtros.hasta, tipos: filtros.tipos }).toString();
      const r = await fetchWithSupabaseSession(`/api/reportes/rg90?${qs}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: Previa; error?: string };
      if (!r.ok || !j.success || !j.data) throw new Error(j.error ?? `Error ${r.status}`);
      setPrevia(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setCargando(false); }
  }, [filtros]);

  async function descargar() {
    if (!previa) return;
    setBajando(true);
    try {
      const qs = new URLSearchParams({ desde: filtros.desde, hasta: filtros.hasta, tipos: filtros.tipos, formato: "xlsx" }).toString();
      const r = await fetchWithSupabaseSession(`/api/reportes/rg90?${qs}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `RG90-${filtros.desde}-a-${filtros.hasta}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setBajando(false); }
  }

  useEffect(() => { void buscar(); /* carga inicial */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filasVisibles = useMemo(() => {
    if (!previa) return [];
    return soloErrores ? previa.filas.filter((f) => f.errores.length > 0) : previa.filas;
  }, [previa, soloErrores]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Reportes</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <FileSpreadsheet className="h-6 w-6 text-slate-500" /> Exportación RG90
          </h1>
          <p className="text-sm text-slate-600">
            Archivo para el Registro Electrónico de Comprobantes en Marangatu (DNIT) — formato oficial de 28 columnas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void descargar()}
          disabled={!previa || bajando || (previa?.total_filas ?? 0) === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="h-4 w-4" />
          {bajando ? "Generando…" : "Descargar XLSX"}
        </button>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="modo" checked={modo === "mes"} onChange={() => setModo("mes")} />
            Un mes
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="modo" checked={modo === "rango"} onChange={() => setModo("rango")} />
            Rango de fechas
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {modo === "mes" ? (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Mes</label>
              <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Desde</label>
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Hasta</label>
                <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
              </div>
            </>
          )}
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={incluyeCompras} onChange={(e) => setIncluyeCompras(e.target.checked)} />
              Compras
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={incluyeVentas} onChange={(e) => setIncluyeVentas(e.target.checked)} />
              Ventas
            </label>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => void buscar()}
              disabled={cargando}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Filter className="h-4 w-4" />
              {cargando ? "Cargando…" : "Actualizar vista previa"}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {previa && (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Card label="Comprobantes" value={previa.total_filas.toLocaleString("es-PY")} />
            <Card label="Total Compras (Gs.)" value={fmt(previa.totales.compras)} />
            <Card label="Total Ventas (Gs.)" value={fmt(previa.totales.ventas)} />
            <Card label="IVA 10%" value={fmt(previa.totales.iva_10)} />
            <Card label="IVA 5%" value={fmt(previa.totales.iva_5)} />
          </div>

          {previa.comprobantes_con_errores > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-amber-900">
                  {previa.comprobantes_con_errores} comprobante{previa.comprobantes_con_errores === 1 ? "" : "s"} con datos faltantes
                </p>
                <p className="text-xs text-amber-800 mt-0.5">
                  Marangatu rechaza las filas con RUC, timbrado o N° de comprobante vacío. Corregí estos comprobantes antes de subir el archivo.
                </p>
                <label className="mt-2 flex items-center gap-1.5 text-xs text-amber-800">
                  <input type="checkbox" checked={soloErrores} onChange={(e) => setSoloErrores(e.target.checked)} />
                  Mostrar sólo los que tienen errores
                </label>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <p className="text-sm font-semibold">Listo para subir — ningún comprobante con datos faltantes.</p>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Tipo</th>
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Comprobante</th>
                  <th className="px-3 py-3">Timbrado</th>
                  <th className="px-3 py-3">N°</th>
                  <th className="px-3 py-3">RUC</th>
                  <th className="px-3 py-3">Razón social</th>
                  <th className="px-3 py-3 text-right">Grav. 10%</th>
                  <th className="px-3 py-3 text-right">Grav. 5%</th>
                  <th className="px-3 py-3 text-right">Exento</th>
                  <th className="px-3 py-3 text-right">Total (Gs.)</th>
                </tr>
              </thead>
              <tbody>
                {filasVisibles.length === 0 && (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-500">No hay filas para los filtros elegidos.</td></tr>
                )}
                {filasVisibles.map((f, i) => {
                  const malo = f.errores.length > 0;
                  const link = f.tipo_registro === "COMPRAS"
                    ? `/libro-compras${f.seccion ? `` : ""}`
                    : `/facturas-exportacion`;
                  return (
                    <tr key={i} className={`border-t border-slate-100 ${malo ? "bg-amber-50/50" : "hover:bg-slate-50"}`}>
                      <td className="px-3 py-2.5 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${f.tipo_registro === "COMPRAS" ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {f.tipo_registro}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{f.fecha}</td>
                      <td className="px-3 py-2.5">
                        {f.tipo_comprobante}
                        {f.moneda !== "PYG" && <span className="ml-1 text-[10px] text-slate-400">({f.moneda})</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{f.timbrado || <span className="text-amber-700">(falta)</span>}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        <Link href={link} className="hover:underline text-slate-700">{f.numero || <span className="text-amber-700">(falta)</span>}</Link>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{f.ruc || <span className="text-amber-700">(falta)</span>}</td>
                      <td className="px-3 py-2.5">{f.nombre}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(f.gravado_10)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(f.gravado_5)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(f.exento)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmt(f.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filasVisibles.some((f) => f.errores.length > 0) && (
              <div className="border-t border-slate-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                <p className="font-semibold">Detalle de los errores:</p>
                {filasVisibles.filter((f) => f.errores.length > 0).slice(0, 20).map((f, i) => (
                  <div key={i}>&bull; {f.id_interno} — {f.nombre}: {f.errores.join("; ")}</div>
                ))}
                {filasVisibles.filter((f) => f.errores.length > 0).length > 20 && (
                  <p className="italic">… y {filasVisibles.filter((f) => f.errores.length > 0).length - 20} más.</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-800">{value}</p>
    </div>
  );
}
