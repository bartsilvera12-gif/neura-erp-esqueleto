"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Factory, Plus, X, Loader2, Search } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { ESTADO_PROYECTO_LABEL } from "@/lib/produccion/estados";

type Proyecto = {
  id: string; codigo: string; nombre: string; cliente_nombre: string | null;
  ubicacion: string | null; fecha_pedido: string | null; fecha_entrega_prevista: string | null;
  prioridad: string; estado: string; created_at: string;
};

const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20";
const label = "mb-1 block text-xs font-medium text-slate-600";

const TONO: Record<string, string> = {
  borrador: "bg-slate-100 text-slate-600 ring-slate-200",
  presupuestado: "bg-sky-50 text-sky-700 ring-sky-200",
  aprobado: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  en_produccion: "bg-amber-50 text-amber-700 ring-amber-200",
  en_revision: "bg-violet-50 text-violet-700 ring-violet-200",
  entregado: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cerrado: "bg-slate-200 text-slate-700 ring-slate-300",
  cancelado: "bg-rose-50 text-rose-700 ring-rose-200",
};
const PRIO: Record<string, string> = { alta: "text-rose-600", media: "text-amber-600", baja: "text-slate-500" };
const fFecha = (iso: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");

export default function ProyectosProduccionPage() {
  const [rows, setRows] = useState<Proyecto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [nuevo, setNuevo] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetchWithSupabaseSession("/api/produccion/proyectos", { cache: "no-store" }).then((x) => x.json());
      if (r?.success) setRows(r.data.proyectos as Proyecto[]); else setError(r?.error ?? "Error");
    } catch { setError("Error de red."); }
    setCargando(false);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const filtradas = rows.filter((t) => {
    const q = buscar.trim().toLowerCase();
    if (!q) return true;
    return [t.codigo, t.nombre, t.cliente_nombre].some((v) => (v ?? "").toLowerCase().includes(q));
  });

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Factory className="h-6 w-6 text-[#4FAEB2]" /> Proyectos de producción</h1>
          <p className="mt-1 text-sm text-slate-500">Proyectos de fabricación de muebles a medida.</p>
        </div>
        <button type="button" onClick={() => setNuevo(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91]"><Plus className="h-4 w-4" /> Nuevo proyecto</button>
      </div>

      <div className="zx-surface mb-4 p-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por código, nombre o cliente…" className={`${input} pl-9`} />
        </div>
      </div>

      <div className="zx-surface overflow-hidden">
        {error ? <p className="px-4 py-8 text-center text-sm text-red-600">{error}</p>
        : cargando ? <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>
        : filtradas.length === 0 ? <p className="px-4 py-12 text-center text-sm text-slate-500">Todavía no hay proyectos.</p>
        : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Código</th>
                  <th className="px-4 py-3 text-left">Nombre</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Entrega</th>
                  <th className="px-4 py-3 text-left">Prioridad</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtradas.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{t.codigo}</td>
                    <td className="px-4 py-3 font-medium">{t.nombre}</td>
                    <td className="px-4 py-3">{t.cliente_nombre ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fFecha(t.fecha_entrega_prevista)}</td>
                    <td className={`px-4 py-3 font-medium capitalize ${PRIO[t.prioridad] ?? ""}`}>{t.prioridad}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${TONO[t.estado] ?? TONO.borrador}`}>{ESTADO_PROYECTO_LABEL[t.estado] ?? t.estado}</span></td>
                    <td className="px-4 py-3 text-right"><Link href={`/produccion/proyectos/${t.id}`} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-[#3F8E91] hover:border-[#4FAEB2]">Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {nuevo && <ModalNuevo onClose={() => setNuevo(false)} />}
    </div>
  );
}

function ModalNuevo({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [clientes, setClientes] = useState<{ id: string; nombre: string }[]>([]);
  const [f, setF] = useState({ nombre: "", cliente_id: "", cliente_nombre: "", ubicacion: "", fecha_pedido: new Date().toISOString().slice(0, 10), fecha_entrega_prevista: "", responsable_diseno: "", responsable_produccion: "", prioridad: "media", observaciones: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchWithSupabaseSession("/api/clientes", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (!j?.success || !Array.isArray(j.data)) return;
      setClientes((j.data as Record<string, unknown>[]).map((r) => ({ id: String(r.id), nombre: String(r.empresa || r.nombre_contacto || r.nombre || "Cliente") })));
    }).catch(() => {});
  }, []);

  async function crear() {
    if (!f.nombre.trim()) return setErr("El nombre es obligatorio.");
    setBusy(true); setErr(null);
    const cliente_nombre = f.cliente_id ? (clientes.find((c) => c.id === f.cliente_id)?.nombre ?? f.cliente_nombre) : f.cliente_nombre;
    const r = await fetchWithSupabaseSession("/api/produccion/proyectos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, cliente_nombre }) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    setBusy(false);
    if (!r?.success) return setErr(r?.error ?? "No se pudo crear.");
    router.push(`/produccion/proyectos/${r.data.proyecto.id}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Nuevo proyecto de producción</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={label}>Nombre del proyecto *</label><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={input} placeholder="Ej: Cocina departamento Villa Morra" /></div>
          <div><label className={label}>Cliente</label>
            <select value={f.cliente_id} onChange={(e) => setF({ ...f, cliente_id: e.target.value })} className={input}>
              <option value="">— Elegir cliente —</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div><label className={label}>Ubicación</label><input value={f.ubicacion} onChange={(e) => setF({ ...f, ubicacion: e.target.value })} className={input} /></div>
          <div><label className={label}>Fecha de pedido</label><input type="date" value={f.fecha_pedido} onChange={(e) => setF({ ...f, fecha_pedido: e.target.value })} className={input} /></div>
          <div><label className={label}>Entrega prevista</label><input type="date" value={f.fecha_entrega_prevista} onChange={(e) => setF({ ...f, fecha_entrega_prevista: e.target.value })} className={input} /></div>
          <div><label className={label}>Responsable de diseño</label><input value={f.responsable_diseno} onChange={(e) => setF({ ...f, responsable_diseno: e.target.value })} className={input} /></div>
          <div><label className={label}>Responsable de producción</label><input value={f.responsable_produccion} onChange={(e) => setF({ ...f, responsable_produccion: e.target.value })} className={input} /></div>
          <div><label className={label}>Prioridad</label>
            <select value={f.prioridad} onChange={(e) => setF({ ...f, prioridad: e.target.value })} className={input}>
              <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
            </select>
          </div>
          <div className="sm:col-span-2"><label className={label}>Observaciones</label><input value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} className={input} /></div>
          {err && <p className="sm:col-span-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button type="button" onClick={crear} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Crear proyecto</button>
        </div>
      </div>
    </div>
  );
}
