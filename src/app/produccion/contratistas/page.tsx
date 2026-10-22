"use client";

import { useCallback, useEffect, useState } from "react";
import { HardHat, Plus, Pencil, Trash2, X, Loader2, Search } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Contratista = {
  id: string;
  nombre: string;
  identificacion: string | null;
  contacto: string | null;
  telefono: string | null;
  especialidad: string | null;
  activo: boolean;
  observaciones: string | null;
};

const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20";
const label = "mb-1 block text-xs font-medium text-slate-600";

export default function ContratistasPage() {
  const [rows, setRows] = useState<Contratista[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [editando, setEditando] = useState<Contratista | null>(null);
  const [nuevo, setNuevo] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetchWithSupabaseSession("/api/produccion/contratistas?incluir_inactivos=1", { cache: "no-store" }).then((x) => x.json());
      if (r?.success) setRows(r.data.contratistas as Contratista[]); else setError(r?.error ?? "Error");
    } catch { setError("Error de red."); }
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const filtradas = rows.filter((t) => {
    const q = buscar.trim().toLowerCase();
    if (!q) return true;
    return [t.nombre, t.identificacion, t.especialidad, t.contacto].some((v) => (v ?? "").toLowerCase().includes(q));
  });

  async function borrar(t: Contratista) {
    if (!confirm(`¿Dar de baja al contratista ${t.nombre}? (queda inactivo, no se borra)`)) return;
    const r = await fetchWithSupabaseSession(`/api/produccion/contratistas/${t.id}`, { method: "DELETE" }).then((x) => x.json());
    if (r?.success) void cargar(); else setError(r?.error ?? "No se pudo dar de baja.");
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><HardHat className="h-6 w-6 text-[#4FAEB2]" /> Contratistas</h1>
          <p className="mt-1 text-sm text-slate-500">Fabricación externa de muebles.</p>
        </div>
        <button type="button" onClick={() => setNuevo(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91]"><Plus className="h-4 w-4" /> Nuevo contratista</button>
      </div>

      <div className="zx-surface mb-4 p-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre, documento, especialidad…" className={`${input} pl-9`} />
        </div>
      </div>

      <div className="zx-surface overflow-hidden">
        {error ? <p className="px-4 py-8 text-center text-sm text-red-600">{error}</p>
        : cargando ? <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>
        : filtradas.length === 0 ? <p className="px-4 py-12 text-center text-sm text-slate-500">Todavía no hay contratistas cargados.</p>
        : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Nombre</th>
                  <th className="px-4 py-3 text-left">RUC / CI</th>
                  <th className="px-4 py-3 text-left">Especialidad</th>
                  <th className="px-4 py-3 text-left">Contacto</th>
                  <th className="px-4 py-3 text-left">Teléfono</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtradas.map((t) => (
                  <tr key={t.id} className={t.activo ? "hover:bg-slate-50/60" : "bg-slate-50/60 text-slate-400"}>
                    <td className="px-4 py-3 font-medium">{t.nombre}{!t.activo && <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ring-1 ring-slate-200">Inactivo</span>}</td>
                    <td className="px-4 py-3">{t.identificacion ?? "—"}</td>
                    <td className="px-4 py-3">{t.especialidad ?? "—"}</td>
                    <td className="px-4 py-3">{t.contacto ?? "—"}</td>
                    <td className="px-4 py-3">{t.telefono ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setEditando(t)} title="Editar" className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:border-[#4FAEB2] hover:text-[#3F8E91]"><Pencil className="h-4 w-4" /></button>
                        {t.activo && <button onClick={() => borrar(t)} title="Dar de baja" className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:border-red-300 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(nuevo || editando) && (
        <ModalContratista contratista={editando} onClose={() => { setNuevo(false); setEditando(null); }} onGuardado={() => { setNuevo(false); setEditando(null); void cargar(); }} />
      )}
    </div>
  );
}

function ModalContratista({ contratista, onClose, onGuardado }: { contratista: Contratista | null; onClose: () => void; onGuardado: () => void }) {
  const esEdit = !!contratista;
  const [f, setF] = useState({
    nombre: contratista?.nombre ?? "",
    identificacion: contratista?.identificacion ?? "",
    contacto: contratista?.contacto ?? "",
    telefono: contratista?.telefono ?? "",
    especialidad: contratista?.especialidad ?? "",
    observaciones: contratista?.observaciones ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!f.nombre.trim()) return setErr("El nombre es obligatorio.");
    setBusy(true); setErr(null);
    const url = esEdit ? `/api/produccion/contratistas/${contratista!.id}` : "/api/produccion/contratistas";
    const r = await fetchWithSupabaseSession(url, { method: esEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    setBusy(false);
    if (!r?.success) return setErr(r?.error ?? "No se pudo guardar.");
    onGuardado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{esEdit ? `Editar contratista` : "Nuevo contratista"}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={label}>Nombre *</label><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={input} /></div>
          <div><label className={label}>RUC / CI</label><input value={f.identificacion} onChange={(e) => setF({ ...f, identificacion: e.target.value })} className={input} /></div>
          <div><label className={label}>Especialidad</label><input value={f.especialidad} onChange={(e) => setF({ ...f, especialidad: e.target.value })} className={input} placeholder="Ej: Armado, lustre, tapizado…" /></div>
          <div><label className={label}>Contacto</label><input value={f.contacto} onChange={(e) => setF({ ...f, contacto: e.target.value })} className={input} /></div>
          <div><label className={label}>Teléfono</label><input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} className={input} /></div>
          <div className="sm:col-span-2"><label className={label}>Observaciones</label><input value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} className={input} /></div>
          {err && <p className="sm:col-span-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button type="button" onClick={guardar} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {esEdit ? "Guardar cambios" : "Crear contratista"}</button>
        </div>
      </div>
    </div>
  );
}
