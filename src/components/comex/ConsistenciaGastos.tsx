"use client";

import { useState } from "react";
import { ShieldCheck, Wrench, AlertTriangle, CheckCircle2 } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Incidencia = {
  tipo: "GASTO_SIN_FACTURA" | "FACTURA_SECCION_INCORRECTA" | "FACTURA_HUERFANA";
  gasto_id?: string;
  comprobante: string | null;
  proveedor: string | null;
  descripcion: string | null;
  monto?: number;
  moneda?: string;
  factura_sugerida_lc?: string | null;
  mensaje: string;
};

type Resultado = { gasto_id: string; estado: "OK" | "ERROR"; mensaje: string };

/**
 * Botón para verificar y reparar la consistencia entre los gastos de una
 * importación y el Libro de Compras C/E. Red de seguridad frente a los bugs
 * del flujo de importación / edición de gastos.
 */
export default function ConsistenciaGastos({
  importacionId,
  onAplicado,
}: {
  importacionId: string;
  onAplicado?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [incidencias, setIncidencias] = useState<Incidencia[] | null>(null);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analizar() {
    setCargando(true); setError(null); setResultados(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/importaciones/${importacionId}/gastos/consistencia`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { incidencias: Incidencia[] }; error?: string };
      if (!r.ok || !j.success) throw new Error(j.error ?? `Error ${r.status}`);
      setIncidencias(j.data?.incidencias ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setCargando(false); }
  }

  async function reparar() {
    setCargando(true); setError(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/importaciones/${importacionId}/gastos/consistencia`, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { resultados: Resultado[]; total: number }; error?: string };
      if (!r.ok || !j.success) throw new Error(j.error ?? `Error ${r.status}`);
      setResultados(j.data?.resultados ?? []);
      onAplicado?.();
      await analizar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setCargando(false); }
  }

  function abrir() {
    setAbierto(true);
    void analizar();
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors"
      >
        <ShieldCheck className="h-4 w-4" />
        Verificar consistencia
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-900/60 backdrop-blur-sm pt-10 px-4" onClick={() => setAbierto(false)}>
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-700" /> Consistencia Gastos ↔ Libro de Compras
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Detecta gastos con comprobante que no están en el Libro de Compras C/E o están enlazados a una factura de otra sección, y los corrige.
                </p>
              </div>
              <button onClick={() => setAbierto(false)} className="text-slate-400 hover:text-slate-700 text-xl">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}

              {cargando && incidencias === null && (
                <p className="text-sm text-slate-500">Analizando…</p>
              )}

              {incidencias !== null && incidencias.length === 0 && !resultados && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <div>
                    <p className="font-semibold">Todo en orden.</p>
                    <p className="text-xs">No se detectaron inconsistencias en esta importación.</p>
                  </div>
                </div>
              )}

              {incidencias !== null && incidencias.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Se detectaron {incidencias.length} inconsistencia{incidencias.length === 1 ? "" : "s"}:
                  </p>
                  <div className="space-y-2">
                    {incidencias.map((inc, i) => (
                      <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                        <p className="font-semibold text-slate-800">
                          {inc.comprobante ?? "(sin nº)"} — {inc.proveedor ?? "(sin proveedor)"}
                        </p>
                        {inc.descripcion && <p className="text-xs text-slate-500">{inc.descripcion}</p>}
                        <p className="text-xs text-amber-800 mt-1">{inc.mensaje}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {resultados && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">Resultado de la reparación:</p>
                  <div className="space-y-1">
                    {resultados.map((r, i) => (
                      <div
                        key={i}
                        className={`rounded border px-3 py-2 text-xs ${
                          r.estado === "OK"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        <span className="font-semibold mr-1">{r.estado === "OK" ? "✓" : "✗"}</span>
                        {r.mensaje}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t flex justify-end gap-2">
              <button onClick={() => setAbierto(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cerrar</button>
              {incidencias !== null && incidencias.length > 0 && (
                <button
                  onClick={() => void reparar()}
                  disabled={cargando}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Wrench className="h-4 w-4" />
                  {cargando ? "Reparando…" : `Reparar ${incidencias.length}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
