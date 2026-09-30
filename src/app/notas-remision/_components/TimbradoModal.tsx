"use client";

import { useEffect, useState } from "react";
import { Aviso, ModalShell, api, btnPrimario, btnSecundario, inputClass, jsonInit, labelClass } from "@/components/comex/ui";

type Config = { timbrado: string; establecimiento: string; punto_expedicion: string; vigencia_desde: string | null; vigencia_hasta: string | null; proximo_numero: number };

/** Timbrado de la DNIT para las notas de remisión: con él se numeran (001-004-0000001) y se imprime en cada nota. */
export function TimbradoModal({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ timbrado: "", establecimiento: "001", punto_expedicion: "", vigencia_desde: "", vigencia_hasta: "", proximo_numero: "1" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ config: Config | null }>("/api/notas-remision/config")
      .then(({ config: c }) => {
        if (c) setF({ timbrado: c.timbrado, establecimiento: c.establecimiento, punto_expedicion: c.punto_expedicion, vigencia_desde: c.vigencia_desde ?? "", vigencia_hasta: c.vigencia_hasta ?? "", proximo_numero: String(c.proximo_numero) });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, []);

  async function guardar() {
    setSaving(true);
    setError(null);
    try {
      await api("/api/notas-remision/config", jsonInit("PUT", { ...f, proximo_numero: Number(f.proximo_numero) }));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Timbrado de notas de remisión" onClose={onClose}>
      <div className="space-y-4 p-5">
        <p className="text-sm text-slate-600">
          Son los datos que autoriza la DNIT para las remisiones. Las notas nuevas salen numeradas con este formato y con el timbrado impreso. Las ya emitidas no cambian.
        </p>
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
              La próxima nota sale como {f.establecimiento || "001"}-{f.punto_expedicion || "___"}-{String(Number(f.proximo_numero) || 1).padStart(7, "0")}.
            </p>
          </div>
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecundario}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={saving} className={btnPrimario}>{saving ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </ModalShell>
  );
}
