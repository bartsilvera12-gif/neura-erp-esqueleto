"use client";

import { useEffect, useState } from "react";
import { Aviso, ModalShell, api, btnPrimario, btnSecundario, inputClass, jsonInit, labelClass } from "@/components/comex/ui";

export type TimbradoNR = {
  id: string;
  timbrado: string;
  establecimiento: string;
  punto_expedicion: string;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
  proximo_numero: number;
  activo: boolean;
};

const vacio = { id: "", timbrado: "", establecimiento: "001", punto_expedicion: "", vigencia_desde: "", vigencia_hasta: "", proximo_numero: "1", activo: true };
const fechaES = (v: string | null) => (v ? v.split("-").reverse().join("/") : "");

/**
 * Timbrados de la DNIT para las notas de remisión. Puede haber varios, uno por
 * punto de expedición; al emitir se elige con cuál sale la nota.
 */
export function TimbradoModal({ onClose }: { onClose: () => void }) {
  const [lista, setLista] = useState<TimbradoNR[]>([]);
  const [f, setF] = useState(vacio);
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cargar = () =>
    api<{ timbrados: TimbradoNR[] }>("/api/notas-remision/config")
      .then((d) => setLista(d.timbrados ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  useEffect(() => { void cargar(); }, []);

  function editar(t: TimbradoNR) {
    setF({
      id: t.id,
      timbrado: t.timbrado,
      establecimiento: t.establecimiento,
      punto_expedicion: t.punto_expedicion,
      vigencia_desde: t.vigencia_desde ?? "",
      vigencia_hasta: t.vigencia_hasta ?? "",
      proximo_numero: String(t.proximo_numero),
      activo: t.activo,
    });
    setEditando(true);
    setError(null);
  }

  async function guardar() {
    setSaving(true);
    setError(null);
    try {
      const cuerpo = { ...f, proximo_numero: Number(f.proximo_numero) };
      if (f.id) await api("/api/notas-remision/config", jsonInit("PUT", cuerpo));
      else await api("/api/notas-remision/config", jsonInit("POST", cuerpo));
      await cargar();
      setF(vacio);
      setEditando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function alternarActivo(t: TimbradoNR) {
    setError(null);
    try {
      await api("/api/notas-remision/config", jsonInit("PUT", {
        id: t.id,
        timbrado: t.timbrado,
        establecimiento: t.establecimiento,
        punto_expedicion: t.punto_expedicion,
        vigencia_desde: t.vigencia_desde,
        vigencia_hasta: t.vigencia_hasta,
        proximo_numero: t.proximo_numero,
        activo: !t.activo,
      }));
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <ModalShell title="Timbrados de notas de remisión" onClose={onClose} ancho="max-w-2xl">
      <div className="space-y-4 p-5">
        <p className="text-sm text-slate-600">
          Son los datos que autoriza la DNIT. Puede haber más de uno, uno por punto de expedición: al emitir una nota se elige con cuál sale.
        </p>

        {lista.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Punto</th>
                  <th className="px-3 py-2">Timbrado</th>
                  <th className="px-3 py-2">Vigencia</th>
                  <th className="px-3 py-2">Próxima nota</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lista.map((t) => (
                  <tr key={t.id} className={`border-t border-slate-100 ${t.activo ? "" : "bg-slate-50 text-slate-400"}`}>
                    <td className="px-3 py-2 font-mono">{t.establecimiento}-{t.punto_expedicion}</td>
                    <td className="px-3 py-2 font-mono">{t.timbrado}</td>
                    <td className="px-3 py-2 text-xs">
                      {t.vigencia_desde ? `${fechaES(t.vigencia_desde)} al ${fechaES(t.vigencia_hasta)}` : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {t.establecimiento}-{t.punto_expedicion}-{String(t.proximo_numero).padStart(7, "0")}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" onClick={() => editar(t)} className="text-xs font-medium text-emerald-700 hover:underline">Editar</button>
                      <button type="button" onClick={() => void alternarActivo(t)} className="ml-3 text-xs text-slate-500 hover:underline">
                        {t.activo ? "Desactivar" : "Activar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!editando && lista.length > 0 && (
          <button type="button" onClick={() => { setF(vacio); setEditando(true); }} className={btnSecundario}>
            + Agregar otro timbrado
          </button>
        )}

        {(editando || lista.length === 0) && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <h3 className="text-sm font-semibold text-slate-800">{f.id ? "Editar timbrado" : "Nuevo timbrado"}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelClass}>Timbrado Nº *</label>
                <input value={f.timbrado} onChange={(e) => setF({ ...f, timbrado: e.target.value.replace(/\D/g, "") })} className={inputClass} placeholder="Ej.: 19025402" />
              </div>
              <div>
                <label className={labelClass}>Establecimiento *</label>
                <input value={f.establecimiento} onChange={(e) => setF({ ...f, establecimiento: e.target.value.replace(/\D/g, "").slice(0, 3) })} className={inputClass} placeholder="001" />
              </div>
              <div>
                <label className={labelClass}>Punto de expedición *</label>
                <input value={f.punto_expedicion} onChange={(e) => setF({ ...f, punto_expedicion: e.target.value.replace(/\D/g, "").slice(0, 3) })} className={inputClass} placeholder="004" />
              </div>
              <div>
                <label className={labelClass}>Vigencia desde</label>
                <input type="date" value={f.vigencia_desde} onChange={(e) => setF({ ...f, vigencia_desde: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Vigencia hasta</label>
                <input type="date" value={f.vigencia_hasta} onChange={(e) => setF({ ...f, vigencia_hasta: e.target.value })} className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Próximo número *</label>
                <input value={f.proximo_numero} onChange={(e) => setF({ ...f, proximo_numero: e.target.value.replace(/\D/g, "") })} className={inputClass} />
                <p className="mt-1 text-xs text-slate-500">
                  La próxima nota de este punto sale como {f.establecimiento || "001"}-{f.punto_expedicion || "___"}-{String(Number(f.proximo_numero) || 1).padStart(7, "0")}.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              {lista.length > 0 && (
                <button type="button" onClick={() => { setF(vacio); setEditando(false); setError(null); }} className={btnSecundario}>Cancelar</button>
              )}
              <button type="button" onClick={guardar} disabled={saving} className={btnPrimario}>{saving ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        )}

        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={btnSecundario}>Cerrar</button>
        </div>
      </div>
    </ModalShell>
  );
}
