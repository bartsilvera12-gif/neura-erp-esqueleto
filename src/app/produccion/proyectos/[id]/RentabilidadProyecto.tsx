"use client";

import { useCallback, useEffect, useState } from "react";
import { TrendingUp, Save, AlertTriangle } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Rent = {
  ingreso: { precio_venta: number; descuento_venta: number; ingreso_previsto: number; ingreso_final: number };
  costo_presupuestado: { materiales: number; contratista: number; total: number };
  costo_real: { gastos: number; contratista: number; total: number; gastos_total: number };
  utilidad_estimada: number; utilidad_real: number; margen_real: number | null; desviacion_costo: number;
  alertas: { gastos_sin_comprobante: number };
};

const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20";
const gs = (n: unknown) => "₲ " + Math.round(Number(n) || 0).toLocaleString("es-PY");

export default function RentabilidadProyecto({ proyectoId }: { proyectoId: string }) {
  const [r, setR] = useState<Rent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [venta, setVenta] = useState({ precio_venta: "", descuento_venta: "", ingreso_final: "" });
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const x = await fetchWithSupabaseSession(`/api/produccion/proyectos/${proyectoId}/rentabilidad`, { cache: "no-store" }).then((z) => z.json()).catch(() => ({ success: false }));
    if (x?.success) { setR(x.data as Rent); setVenta({ precio_venta: String(x.data.ingreso.precio_venta || ""), descuento_venta: String(x.data.ingreso.descuento_venta || ""), ingreso_final: String(x.data.ingreso.ingreso_final || "") }); }
  }, [proyectoId]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function guardar() {
    setGuardando(true); setError(null);
    const body = { precio_venta: Number(venta.precio_venta) || 0, descuento_venta: Number(venta.descuento_venta) || 0, ingreso_final: Number(venta.ingreso_final) || 0 };
    const x = await fetchWithSupabaseSession(`/api/produccion/proyectos/${proyectoId}/venta`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((z) => z.json()).catch(() => ({ success: false, error: "Error de red." }));
    setGuardando(false);
    if (x?.success) void cargar(); else setError(x?.error ?? "No se pudo guardar.");
  }

  if (!r) return null;
  const pos = (n: number) => (n >= 0 ? "text-emerald-700" : "text-rose-600");

  return (
    <div className="zx-surface mt-4 p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><TrendingUp className="h-4 w-4 text-[#4FAEB2]" /> Rentabilidad del proyecto</h2>
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Venta / ingreso editable */}
      <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-4">
        <div><label className="text-[11px] text-slate-400">Precio de venta</label><input type="number" value={venta.precio_venta} onChange={(e) => setVenta({ ...venta, precio_venta: e.target.value })} className={input} /></div>
        <div><label className="text-[11px] text-slate-400">Descuento</label><input type="number" value={venta.descuento_venta} onChange={(e) => setVenta({ ...venta, descuento_venta: e.target.value })} className={input} /></div>
        <div><label className="text-[11px] text-slate-400">Ingreso final (facturado)</label><input type="number" value={venta.ingreso_final} onChange={(e) => setVenta({ ...venta, ingreso_final: e.target.value })} className={input} /></div>
        <div className="flex items-end"><button onClick={guardar} disabled={guardando} className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"><Save className="h-4 w-4" /> {guardando ? "Guardando…" : "Guardar"}</button></div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Presupuestado */}
        <div className="rounded-lg border border-slate-100 p-3 text-sm">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Presupuestado (estimado)</h3>
          <dl className="space-y-1 text-slate-600">
            <div className="flex justify-between"><dt>Materiales</dt><dd className="font-mono">{gs(r.costo_presupuestado.materiales)}</dd></div>
            <div className="flex justify-between"><dt>Contratista</dt><dd className="font-mono">{gs(r.costo_presupuestado.contratista)}</dd></div>
            <div className="flex justify-between border-t border-slate-100 pt-1 font-semibold text-slate-800"><dt>Costo presupuestado</dt><dd className="font-mono">{gs(r.costo_presupuestado.total)}</dd></div>
            <div className="flex justify-between"><dt>Ingreso previsto</dt><dd className="font-mono">{gs(r.ingreso.ingreso_previsto)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Utilidad estimada</dt><dd className={`font-mono ${pos(r.utilidad_estimada)}`}>{gs(r.utilidad_estimada)}</dd></div>
          </dl>
        </div>
        {/* Real */}
        <div className="rounded-lg border border-slate-100 p-3 text-sm">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Real (ejecutado)</h3>
          <dl className="space-y-1 text-slate-600">
            <div className="flex justify-between"><dt>Gastos imputados</dt><dd className="font-mono">{gs(r.costo_real.gastos)}</dd></div>
            <div className="flex justify-between"><dt>Contratista</dt><dd className="font-mono">{gs(r.costo_real.contratista)}</dd></div>
            <div className="flex justify-between border-t border-slate-100 pt-1 font-semibold text-slate-800"><dt>Costo real</dt><dd className="font-mono">{gs(r.costo_real.total)}</dd></div>
            <div className="flex justify-between"><dt>Ingreso final</dt><dd className="font-mono">{gs(r.ingreso.ingreso_final)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Utilidad real</dt><dd className={`font-mono ${pos(r.utilidad_real)}`}>{gs(r.utilidad_real)}</dd></div>
          </dl>
        </div>
      </div>

      {/* Indicadores */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3 text-center">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Margen real</p>
          <p className={`text-lg font-bold ${r.margen_real == null ? "text-slate-400" : pos(r.margen_real)}`}>{r.margen_real == null ? "No calculable" : `${r.margen_real}%`}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-center">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Desviación de costo</p>
          <p className={`text-lg font-bold ${r.desviacion_costo <= 0 ? "text-emerald-700" : "text-rose-600"}`}>{gs(r.desviacion_costo)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-center">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Utilidad real</p>
          <p className={`text-lg font-bold ${pos(r.utilidad_real)}`}>{gs(r.utilidad_real)}</p>
        </div>
      </div>
      {r.alertas.gastos_sin_comprobante > 0 && <p className="mt-3 flex items-center gap-1 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> {r.alertas.gastos_sin_comprobante} gasto(s) sin comprobante.</p>}
      {r.margen_real == null && <p className="mt-2 text-xs text-slate-400">El margen se muestra como &quot;No calculable&quot; mientras el ingreso final sea cero (RB-010).</p>}
    </div>
  );
}
