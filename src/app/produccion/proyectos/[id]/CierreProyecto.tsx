"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, Unlock, CheckCircle2, AlertTriangle } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Snapshot = { costo_real?: { total?: number }; utilidad_real?: number; margen_real?: number | null; ingreso?: { ingreso_final?: number } } | null;
type Cierre = { cerrado_por: string | null; cerrado_at: string | null; inspeccion_responsable: string | null; inspeccion_observaciones: string | null; retrabajos: string | null; excepcion_motivo: string | null; snapshot: Snapshot } | null;
type Estado = { estado: string; pendientes: string[]; puede_cerrar: boolean; cierre: Cierre };

const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20";
const gs = (n: unknown) => "₲ " + Math.round(Number(n) || 0).toLocaleString("es-PY");
const fFechaHora = (v: unknown) => (v ? new Date(String(v)).toLocaleString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default function CierreProyecto({ proyectoId, onCambio }: { proyectoId: string; onCambio?: () => void }) {
  const [st, setSt] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insp, setInsp] = useState({ inspeccion_responsable: "", inspeccion_observaciones: "", retrabajos: "", excepcion_motivo: "" });

  const cargar = useCallback(async () => {
    const r = await fetchWithSupabaseSession(`/api/produccion/proyectos/${proyectoId}/cierre`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false }));
    if (r?.success) setSt(r.data as Estado);
  }, [proyectoId]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function cerrar(conExcepcion: boolean) {
    setError(null);
    const body = { ...insp, excepcion_motivo: conExcepcion ? insp.excepcion_motivo : "" };
    const r = await fetchWithSupabaseSession(`/api/produccion/proyectos/${proyectoId}/cierre`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) { await cargar(); onCambio?.(); }
    else if (/pendientes que bloquean/i.test(r?.error ?? "")) { setError(r.error); }
    else setError(r?.error ?? "No se pudo cerrar.");
  }
  async function reabrir() {
    const motivo = prompt("Motivo de la reapertura:");
    if (!motivo) return;
    const r = await fetchWithSupabaseSession(`/api/produccion/proyectos/${proyectoId}/reapertura`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo }) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) { await cargar(); onCambio?.(); } else setError(r?.error ?? "No se pudo reabrir.");
  }

  if (!st) return null;
  const cerrado = st.estado === "cerrado";
  const hayPendientes = st.pendientes.length > 0;

  return (
    <div className="zx-surface mt-4 p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">{cerrado ? <Lock className="h-4 w-4 text-emerald-600" /> : <CheckCircle2 className="h-4 w-4 text-[#4FAEB2]" />} Inspección y cierre del proyecto</h2>
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {cerrado && st.cierre ? (
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-1 rounded bg-emerald-50 px-3 py-2 text-emerald-700"><Lock className="h-4 w-4" /> Proyecto cerrado por {st.cierre.cerrado_por ?? "—"} el {fFechaHora(st.cierre.cerrado_at)}. Queda en solo lectura.</p>
          {st.cierre.excepcion_motivo && <p className="text-xs text-amber-700">Cerrado con excepción: {st.cierre.excepcion_motivo}</p>}
          {st.cierre.inspeccion_responsable && <p className="text-xs text-slate-500">Inspección: {st.cierre.inspeccion_responsable}{st.cierre.inspeccion_observaciones ? ` — ${st.cierre.inspeccion_observaciones}` : ""}</p>}
          {st.cierre.snapshot && (
            <div className="grid grid-cols-3 gap-2 pt-2">
              <div className="rounded-lg bg-slate-50 p-2 text-center"><p className="text-[11px] text-slate-400">Costo real</p><p className="font-mono font-semibold">{gs(st.cierre.snapshot.costo_real?.total)}</p></div>
              <div className="rounded-lg bg-slate-50 p-2 text-center"><p className="text-[11px] text-slate-400">Utilidad real</p><p className="font-mono font-semibold">{gs(st.cierre.snapshot.utilidad_real)}</p></div>
              <div className="rounded-lg bg-slate-50 p-2 text-center"><p className="text-[11px] text-slate-400">Margen</p><p className="font-semibold">{st.cierre.snapshot.margen_real == null ? "N/C" : `${st.cierre.snapshot.margen_real}%`}</p></div>
            </div>
          )}
          <div className="pt-2"><button onClick={reabrir} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Unlock className="h-4 w-4" /> Reabrir (queda auditado)</button></div>
        </div>
      ) : st.estado !== "entregado" ? (
        <p className="text-sm text-slate-500">El cierre se habilita cuando el proyecto esté en estado <b>Entregado</b>. Estado actual: <b className="capitalize">{st.estado}</b>.</p>
      ) : (
        <div className="space-y-3">
          {hayPendientes && (
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="mb-1 flex items-center gap-1 text-sm font-medium text-amber-800"><AlertTriangle className="h-4 w-4" /> Pendientes antes de cerrar:</p>
              <ul className="list-inside list-disc text-xs text-amber-700">{st.pendientes.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div><label className="text-[11px] text-slate-400">Responsable de inspección</label><input value={insp.inspeccion_responsable} onChange={(e) => setInsp({ ...insp, inspeccion_responsable: e.target.value })} className={input} /></div>
            <div><label className="text-[11px] text-slate-400">Retrabajos</label><input value={insp.retrabajos} onChange={(e) => setInsp({ ...insp, retrabajos: e.target.value })} className={input} /></div>
            <div className="sm:col-span-2"><label className="text-[11px] text-slate-400">Observaciones de inspección</label><input value={insp.inspeccion_observaciones} onChange={(e) => setInsp({ ...insp, inspeccion_observaciones: e.target.value })} className={input} /></div>
            {hayPendientes && <div className="sm:col-span-2"><label className="text-[11px] text-rose-500">Motivo de excepción (para cerrar con pendientes)</label><input value={insp.excepcion_motivo} onChange={(e) => setInsp({ ...insp, excepcion_motivo: e.target.value })} className={input} /></div>}
          </div>
          <div className="flex justify-end">
            {hayPendientes
              ? <button onClick={() => cerrar(true)} disabled={!insp.excepcion_motivo.trim()} className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"><Lock className="h-4 w-4" /> Cerrar con excepción</button>
              : <button onClick={() => cerrar(false)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Lock className="h-4 w-4" /> Cerrar proyecto</button>}
          </div>
        </div>
      )}
    </div>
  );
}
