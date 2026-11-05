"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { ESTADO_LABEL, ESTADOS_HERRAMIENTA, type EstadoHerramienta } from "@/lib/herramientas/types";

type Herramienta = {
  id: string;
  nombre: string;
  categoria: string | null;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  ubicacion: string | null;
  responsable: string | null;
  estado: EstadoHerramienta;
  fecha_adquisicion: string | null;
  costo: number | null;
  observaciones: string | null;
};

const L = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1";
const I = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200";

export default function HerramientaModal({
  herramienta,
  onClose,
  onSaved,
}: {
  herramienta: Herramienta | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editando = Boolean(herramienta);
  const [form, setForm] = useState({
    nombre: herramienta?.nombre ?? "",
    categoria: herramienta?.categoria ?? "",
    marca: herramienta?.marca ?? "",
    modelo: herramienta?.modelo ?? "",
    numero_serie: herramienta?.numero_serie ?? "",
    ubicacion: herramienta?.ubicacion ?? "",
    responsable: herramienta?.responsable ?? "",
    estado: (herramienta?.estado ?? "FUNCIONANDO") as EstadoHerramienta,
    fecha_adquisicion: herramienta?.fecha_adquisicion ?? "",
    costo: herramienta?.costo != null ? String(herramienta.costo) : "",
    observaciones: herramienta?.observaciones ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function guardar() {
    setError(null);
    if (!form.nombre.trim()) { setError("El nombre es obligatorio."); return; }
    setGuardando(true);
    const body = {
      ...form,
      costo: form.costo ? Number(form.costo) : null,
      fecha_adquisicion: form.fecha_adquisicion || null,
    };
    const url = editando ? `/api/herramientas/${herramienta!.id}` : `/api/herramientas`;
    const method = editando ? "PATCH" : "POST";
    const r = await fetchWithSupabaseSession(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
    setGuardando(false);
    if (!r.ok || !j.success) { setError(j.error ?? `Error ${r.status}`); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-900/60 backdrop-blur-sm pt-10 px-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{editando ? `Editar: ${herramienta!.nombre}` : "Nueva herramienta / máquina"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div>
            <label className={L}>Nombre *</label>
            <input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej: Cortadora de mesa portátil" className={I} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={L}>Categoría</label>
              <input value={form.categoria} onChange={(e) => set("categoria", e.target.value)} placeholder="Ej: Herramienta eléctrica" className={I} />
            </div>
            <div>
              <label className={L}>Estado</label>
              <select value={form.estado} onChange={(e) => set("estado", e.target.value as EstadoHerramienta)} className={I}>
                {ESTADOS_HERRAMIENTA.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
              </select>
            </div>
            <div>
              <label className={L}>Marca</label>
              <input value={form.marca} onChange={(e) => set("marca", e.target.value)} className={I} />
            </div>
            <div>
              <label className={L}>Modelo</label>
              <input value={form.modelo} onChange={(e) => set("modelo", e.target.value)} className={I} />
            </div>
            <div>
              <label className={L}>N° de serie</label>
              <input value={form.numero_serie} onChange={(e) => set("numero_serie", e.target.value)} className={I} />
            </div>
            <div>
              <label className={L}>Ubicación</label>
              <input value={form.ubicacion} onChange={(e) => set("ubicacion", e.target.value)} placeholder="Ej: Taller, Depósito B" className={I} />
            </div>
            <div>
              <label className={L}>Responsable</label>
              <input value={form.responsable} onChange={(e) => set("responsable", e.target.value)} placeholder="Persona a cargo" className={I} />
            </div>
            <div>
              <label className={L}>Fecha de adquisición</label>
              <input type="date" value={form.fecha_adquisicion} onChange={(e) => set("fecha_adquisicion", e.target.value)} className={I} />
            </div>
            <div>
              <label className={L}>Costo (Gs.)</label>
              <input type="number" step="1" min="0" value={form.costo} onChange={(e) => set("costo", e.target.value)} className={I} />
            </div>
          </div>
          <div>
            <label className={L}>Observaciones</label>
            <textarea rows={3} value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} placeholder="Notas sobre reparaciones, mantenimiento, uso, etc." className={I} />
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button onClick={() => void guardar()} disabled={guardando} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear herramienta"}
          </button>
        </div>
      </div>
    </div>
  );
}
