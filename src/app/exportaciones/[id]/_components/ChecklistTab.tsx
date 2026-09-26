"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import type { ChecklistItem, Exportacion } from "@/lib/exportaciones/types";
import { CHECKLIST_DESPACHO } from "@/lib/exportaciones/checklist";
import { Aviso, api, fechaHora, inputClass, jsonInit } from "@/components/comex/ui";

/** Control previo al despacho: cada punto guarda quién lo marcó y cuándo (QA-02). */
export default function ChecklistTab({ exp, onCambio }: { exp: Exportacion; onCambio: () => void }) {
  const editable = exp.estado === "preparacion" || exp.estado === "documentacion";
  const [lista, setLista] = useState<ChecklistItem[]>([]);
  const [obs, setObs] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const d = await api<{ checklist: ChecklistItem[] }>(`/api/exportaciones/${exp.id}/checklist`);
      setLista(d.checklist);
      setObs(Object.fromEntries(d.checklist.map((c) => [c.item, c.observacion ?? ""])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [exp.id]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function marcar(item: string, ok: boolean, soloObservacion = false) {
    setGuardando(item);
    setError(null);
    try {
      await api(
        `/api/exportaciones/${exp.id}/checklist`,
        jsonInit("POST", { item, ok, observacion: obs[item] ?? "", solo_observacion: soloObservacion })
      );
      await cargar();
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setGuardando(null);
    }
  }

  const hechos = lista.filter((c) => c.ok).length;
  const porItem = new Map(lista.map((c) => [c.item, c]));

  return (
    <section className="space-y-3">
      <p className="text-sm text-slate-600">
        <strong>
          {hechos} de {CHECKLIST_DESPACHO.length}
        </strong>{" "}
        controles hechos. El despacho no se puede aprobar hasta completar todos.
        {!editable && " Para cambiar algo, volvé la exportación a Documentación."}
      </p>
      {error && <Aviso>{error}</Aviso>}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {CHECKLIST_DESPACHO.map((c) => {
          const r = porItem.get(c.key);
          const ok = !!r?.ok;
          return (
            <div key={c.key} className="flex flex-wrap items-start gap-3 border-t border-slate-100 px-4 py-3 first:border-t-0">
              <button
                onClick={() => editable && void marcar(c.key, !ok)}
                disabled={!editable || guardando === c.key}
                className="mt-0.5 disabled:cursor-default"
                aria-label={ok ? "Desmarcar" : "Marcar como hecho"}
              >
                {ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-slate-300" />}
              </button>
              <div className="min-w-[200px] flex-1">
                <p className={`text-sm font-medium ${ok ? "text-slate-900" : "text-slate-700"}`}>{c.label}</p>
                <p className="text-xs text-slate-500">{c.ayuda}</p>
                {r?.usuario_nombre && (
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {ok ? "Hecho" : "Desmarcado"} por {r.usuario_nombre} el {fechaHora(r.updated_at)}
                  </p>
                )}
              </div>
              <div className="flex w-full max-w-xs items-center gap-2 sm:w-auto">
                <input
                  value={obs[c.key] ?? ""}
                  onChange={(e) => setObs({ ...obs, [c.key]: e.target.value })}
                  disabled={!editable}
                  placeholder="Observación (opcional)"
                  className={`${inputClass} text-xs`}
                />
                {editable && (obs[c.key] ?? "") !== (r?.observacion ?? "") && (
                  <button onClick={() => void marcar(c.key, ok, true)} disabled={guardando === c.key} className="shrink-0 text-xs font-medium text-emerald-700 hover:underline">
                    Guardar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
