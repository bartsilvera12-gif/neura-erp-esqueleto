"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import type { Incidencia, OrigenComex } from "@/lib/comex/types";
import {
  ESTADO_INCIDENCIA_LABEL,
  FLUJO_INCIDENCIA,
  TIPO_INCIDENCIA_LABEL,
  incidenciaAbierta,
} from "@/lib/comex/estados";
import {
  Aviso,
  ModalShell,
  ResponsableSelect,
  api,
  btnPrimario,
  btnSecundario,
  fechaHora,
  inputClass,
  jsonInit,
  labelClass,
  useUsuarios,
} from "./ui";

const BADGE_ESTADO: Record<string, string> = {
  detectado: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  asignado: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  en_proceso: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  resuelto: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  verificado: "bg-slate-100 text-slate-600",
};
const BADGE_PRIORIDAD: Record<string, string> = {
  alta: "text-rose-700",
  media: "text-amber-700",
  baja: "text-slate-500",
};

/** Incidencias de una operación: alta manual, asignación y avance de estados. */
export default function IncidenciasPanel({
  origenTipo,
  origenId,
  bloqueado,
  onCambio,
}: {
  origenTipo: OrigenComex;
  origenId: string;
  bloqueado?: boolean;
  onCambio?: () => void;
}) {
  const usuarios = useUsuarios();
  const [lista, setLista] = useState<Incidencia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [editando, setEditando] = useState<Incidencia | null>(null);

  const cargar = useCallback(async () => {
    try {
      const d = await api<{ incidencias: Incidencia[] }>(`/api/comex/incidencias?origen_tipo=${origenTipo}&origen_id=${origenId}`);
      setLista(d.incidencias);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [origenTipo, origenId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const refrescar = () => {
    void cargar();
    onCambio?.();
  };
  const abiertas = lista.filter((i) => incidenciaAbierta(i.estado)).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {abiertas ? (
            <span className="inline-flex items-center gap-1 font-medium text-rose-700">
              <AlertTriangle className="h-4 w-4" /> {abiertas} sin resolver
            </span>
          ) : (
            "Sin incidencias abiertas."
          )}
        </p>
        {!bloqueado && (
          <button onClick={() => setNueva(true)} className={btnPrimario}>
            <Plus className="h-3.5 w-3.5" /> Nueva incidencia
          </button>
        )}
      </div>
      {error && <Aviso>{error}</Aviso>}
      <div className="space-y-2">
        {lista.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">No hay incidencias.</p>}
        {lista.map((i) => (
          <div key={i.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2.5 py-1 font-semibold ${BADGE_ESTADO[i.estado]}`}>{ESTADO_INCIDENCIA_LABEL[i.estado]}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{TIPO_INCIDENCIA_LABEL[i.tipo] ?? i.tipo}</span>
                <span className={`font-semibold uppercase ${BADGE_PRIORIDAD[i.prioridad]}`}>Prioridad {i.prioridad}</span>
              </div>
              {i.estado !== "verificado" && !bloqueado && (
                <button onClick={() => setEditando(i)} className={btnSecundario}>
                  Gestionar
                </button>
              )}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-800">{i.descripcion}</p>
            {i.accion_correctiva && (
              <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                <span className="font-semibold">Qué se hizo:</span> {i.accion_correctiva}
              </div>
            )}
            <dl className="mt-3 grid gap-x-6 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500 sm:grid-cols-3">
              <div>
                <dt className="inline font-medium text-slate-600">Creada: </dt>
                <dd className="inline">{fechaHora(i.created_at)} · {i.created_by_nombre ?? "Sistema"}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-slate-600">Responsable: </dt>
                <dd className="inline">{i.responsable_nombre ?? "sin asignar"}</dd>
              </div>
              {i.verificado_por_nombre && (
                <div>
                  <dt className="inline font-medium text-slate-600">Verificó: </dt>
                  <dd className="inline">{i.verificado_por_nombre} · {fechaHora(i.verificado_at)}</dd>
                </div>
              )}
            </dl>
          </div>
        ))}
      </div>

      {nueva && (
        <ModalNueva
          origenTipo={origenTipo}
          origenId={origenId}
          usuarios={usuarios}
          onClose={() => setNueva(false)}
          onSaved={refrescar}
        />
      )}
      {editando && <ModalGestionar inc={editando} usuarios={usuarios} onClose={() => setEditando(null)} onSaved={refrescar} />}
    </section>
  );
}

function ModalNueva({
  origenTipo,
  origenId,
  usuarios,
  onClose,
  onSaved,
}: {
  origenTipo: OrigenComex;
  origenId: string;
  usuarios: ReturnType<typeof useUsuarios>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState("OTRO");
  const [desc, setDesc] = useState("");
  const [prioridad, setPrioridad] = useState("media");
  const [resp, setResp] = useState<{ id: string | null; nombre: string | null }>({ id: null, nombre: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/api/comex/incidencias", jsonInit("POST", {
        origen_tipo: origenTipo,
        origen_id: origenId,
        tipo,
        descripcion: desc,
        prioridad,
        responsable_id: resp.id,
        responsable_nombre: resp.nombre,
      }));
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Nueva incidencia" onClose={onClose}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputClass}>
              {["DOCUMENTACION", "DIFERENCIA_RECEPCION", "OTRO"].map((t) => (
                <option key={t} value={t}>
                  {TIPO_INCIDENCIA_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Prioridad</label>
            <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} className={inputClass}>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Qué pasó *</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Responsable</label>
          <ResponsableSelect usuarios={usuarios} id={resp.id} nombre={resp.nombre} onChange={(id, nombre) => setResp({ id, nombre })} />
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={saving} className={btnPrimario}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalGestionar({
  inc,
  usuarios,
  onClose,
  onSaved,
}: {
  inc: Incidencia;
  usuarios: ReturnType<typeof useUsuarios>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [resp, setResp] = useState<{ id: string | null; nombre: string | null }>({ id: inc.responsable_id, nombre: inc.responsable_nombre });
  const [accion, setAccion] = useState(inc.accion_correctiva ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idx = FLUJO_INCIDENCIA.indexOf(inc.estado);
  const siguiente = FLUJO_INCIDENCIA[idx + 1];
  const etiquetaSiguiente: Record<string, string> = {
    asignado: "Marcar asignada",
    en_proceso: "Empezar a trabajarla",
    resuelto: "Marcar resuelta",
    verificado: "Verificar y cerrar",
  };

  async function guardar(estado?: string) {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/comex/incidencias/${inc.id}`, jsonInit("PATCH", {
        responsable_id: resp.id,
        responsable_nombre: resp.nombre,
        accion_correctiva: accion,
        ...(estado ? { estado } : {}),
      }));
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Gestionar incidencia" onClose={onClose}>
      <div className="space-y-4">
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{inc.descripcion}</p>
        <p className="text-xs text-slate-500">
          Estado actual: <strong>{ESTADO_INCIDENCIA_LABEL[inc.estado]}</strong>
        </p>
        <div>
          <label className={labelClass}>Responsable</label>
          <ResponsableSelect usuarios={usuarios} id={resp.id} nombre={resp.nombre} onChange={(id, nombre) => setResp({ id, nombre })} />
        </div>
        <div>
          <label className={labelClass}>Acción correctiva (qué se hizo)</label>
          <textarea value={accion} onChange={(e) => setAccion(e.target.value)} rows={3} className={inputClass} />
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex flex-wrap justify-end gap-2">
          {inc.estado === "resuelto" && (
            <button onClick={() => guardar("en_proceso")} disabled={saving} className={btnSecundario}>
              No quedó bien: volver a En proceso
            </button>
          )}
          <button onClick={() => guardar()} disabled={saving} className={btnSecundario}>
            Guardar cambios
          </button>
          {siguiente && (
            <button onClick={() => guardar(siguiente)} disabled={saving} className={btnPrimario}>
              {etiquetaSiguiente[siguiente]}
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
