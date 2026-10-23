"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Download, AlertTriangle, Clock } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { ESTADO_PROYECTO_LABEL } from "@/lib/produccion/estados";

type ProyectoPanel = { id: string; codigo: string; nombre: string; cliente_nombre: string | null; estado: string; fecha_entrega_prevista: string | null; costo_presupuestado: number; costo_real: number; ingreso_final: number; utilidad_real: number; margen_real: number | null; desviacion: number; retrasado: boolean };
type InventarioPanel = { articulo_tipo: string; codigo: string; descripcion: string; unidad: string; fisico: number; reservado: number; disponible: number; stock_minimo: number | null; bajo: boolean };
type Datos = { proyectos: ProyectoPanel[]; resumen_estados: Record<string, number>; retrasados: number; proximos: number; inventario: InventarioPanel[]; bajo_minimo: number; desviaciones_causa: { causa: string; label: string; monto: number }[] };

const gs = (n: unknown) => "₲ " + Math.round(Number(n) || 0).toLocaleString("es-PY");
const fFecha = (v: unknown) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—");

export default function PanelProduccionPage() {
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await fetchWithSupabaseSession("/api/produccion/panel", { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false }));
    if (r?.success) setD(r.data as Datos);
    setCargando(false);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function exportar(reporte: string) {
    const r = await fetchWithSupabaseSession(`/api/produccion/panel/export?reporte=${reporte}`, { cache: "no-store" });
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `produccion-${reporte}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  }

  if (cargando) return <p className="p-6 text-sm text-slate-500">Cargando panel…</p>;
  if (!d) return <p className="p-6 text-sm text-red-600">No se pudo cargar el panel.</p>;

  const totalProy = d.proyectos.length;
  const btnExp = "inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50";

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-bold text-slate-900"><LayoutDashboard className="h-6 w-6 text-[#4FAEB2]" /> Panel de producción</h1>

      {/* Tarjetas resumen */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="zx-surface p-4"><p className="text-xs text-slate-400">Proyectos</p><p className="text-2xl font-bold text-slate-900">{totalProy}</p></div>
        <div className="zx-surface p-4"><p className="flex items-center gap-1 text-xs text-slate-400"><Clock className="h-3.5 w-3.5" /> Próximos a vencer</p><p className="text-2xl font-bold text-amber-600">{d.proximos}</p></div>
        <div className="zx-surface p-4"><p className="flex items-center gap-1 text-xs text-slate-400"><AlertTriangle className="h-3.5 w-3.5" /> Retrasados</p><p className="text-2xl font-bold text-rose-600">{d.retrasados}</p></div>
        <div className="zx-surface p-4"><p className="text-xs text-slate-400">Artículos bajo mínimo</p><p className="text-2xl font-bold text-rose-600">{d.bajo_minimo}</p></div>
      </div>

      {/* Proyectos por estado */}
      <div className="zx-surface mb-5 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Proyectos por estado</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(d.resumen_estados).map(([e, n]) => (
            <span key={e} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{ESTADO_PROYECTO_LABEL[e] ?? e}: <b>{n}</b></span>
          ))}
          {Object.keys(d.resumen_estados).length === 0 && <span className="text-xs text-slate-400">Sin proyectos.</span>}
        </div>
      </div>

      {/* Rentabilidad por proyecto */}
      <div className="zx-surface mb-5 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Presupuesto vs. real · Rentabilidad por proyecto</h2>
          <button onClick={() => exportar("rentabilidad")} className={btnExp}><Download className="h-3.5 w-3.5" /> Excel</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="px-2 py-1.5 font-medium">Proyecto</th><th className="px-2 py-1.5 font-medium">Estado</th>
              <th className="px-2 py-1.5 text-right font-medium">Costo pres.</th><th className="px-2 py-1.5 text-right font-medium">Costo real</th>
              <th className="px-2 py-1.5 text-right font-medium">Ingreso</th><th className="px-2 py-1.5 text-right font-medium">Utilidad</th>
              <th className="px-2 py-1.5 text-right font-medium">Margen</th><th className="px-2 py-1.5 text-right font-medium">Desv.</th>
            </tr></thead>
            <tbody>
              {d.proyectos.length === 0 && <tr><td colSpan={8} className="px-2 py-4 text-center text-slate-400">Sin proyectos.</td></tr>}
              {d.proyectos.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-2 py-1.5"><Link href={`/produccion/proyectos/${p.id}`} className="hover:underline"><span className="font-mono text-xs text-[#3F8E91]">{p.codigo}</span> {p.nombre}</Link>{p.retrasado && <span className="ml-1 text-[11px] text-rose-500">(retrasado)</span>}</td>
                  <td className="px-2 py-1.5 text-xs text-slate-500">{ESTADO_PROYECTO_LABEL[p.estado] ?? p.estado}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{gs(p.costo_presupuestado)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{gs(p.costo_real)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{gs(p.ingreso_final)}</td>
                  <td className={`px-2 py-1.5 text-right font-mono text-xs ${p.utilidad_real >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{gs(p.utilidad_real)}</td>
                  <td className="px-2 py-1.5 text-right text-xs font-semibold">{p.margen_real == null ? "N/C" : `${p.margen_real}%`}</td>
                  <td className={`px-2 py-1.5 text-right font-mono text-xs ${p.desviacion <= 0 ? "text-emerald-700" : "text-rose-600"}`}>{gs(p.desviacion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Inventario */}
        <div className="zx-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Inventario</h2>
            <button onClick={() => exportar("inventario")} className={btnExp}><Download className="h-3.5 w-3.5" /> Excel</button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400"><th className="px-2 py-1.5 font-medium">Artículo</th><th className="px-2 py-1.5 text-right font-medium">Disp.</th><th className="px-2 py-1.5 text-right font-medium">Mín.</th></tr></thead>
              <tbody>
                {d.inventario.length === 0 && <tr><td colSpan={3} className="px-2 py-4 text-center text-slate-400">Sin artículos.</td></tr>}
                {d.inventario.map((a) => (
                  <tr key={`${a.articulo_tipo}-${a.codigo}`} className="border-b border-slate-50 last:border-0">
                    <td className="px-2 py-1.5"><span className="font-mono text-xs text-[#3F8E91]">{a.codigo}</span> <span className="text-xs text-slate-600">{a.descripcion}</span></td>
                    <td className={`px-2 py-1.5 text-right font-mono ${a.bajo ? "font-bold text-rose-600" : ""}`}>{a.disponible} <span className="text-[11px] text-slate-400">{a.unidad}</span></td>
                    <td className="px-2 py-1.5 text-right text-xs text-slate-400">{a.stock_minimo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Desviaciones por causa */}
        <div className="zx-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Causas de desviación (adicionales)</h2>
            <button onClick={() => exportar("desviaciones")} className={btnExp}><Download className="h-3.5 w-3.5" /> Excel</button>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {d.desviaciones_causa.length === 0 && <tr><td className="px-2 py-4 text-center text-slate-400">Sin adicionales registrados.</td></tr>}
              {d.desviaciones_causa.map((c) => (
                <tr key={c.causa} className="border-b border-slate-50 last:border-0">
                  <td className="px-2 py-1.5 text-slate-600">{c.label}</td>
                  <td className="px-2 py-1.5 text-right font-mono font-semibold">{gs(c.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
