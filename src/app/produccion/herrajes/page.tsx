"use client";

import { useCallback, useEffect, useState } from "react";
import { Wrench, Plus, Pencil, Trash2, X, Loader2, Search } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Herraje = {
  id: string;
  codigo: string;
  descripcion: string;
  categoria: string | null;
  marca_modelo: string | null;
  especificacion: string | null;
  unidad: string | null;
  proveedor_id: string | null;
  stock_minimo: number | null;
  costo_referencia: number | null;
  activo: boolean;
  observaciones: string | null;
};
type Prov = { id: string; nombre: string };

const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20";
const label = "mb-1 block text-xs font-medium text-slate-600";
const gs = (n: number | null) => "Gs. " + Math.round(Number(n) || 0).toLocaleString("es-PY");

export default function HerrajesPage() {
  const [rows, setRows] = useState<Herraje[]>([]);
  const [provs, setProvs] = useState<Prov[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [editando, setEditando] = useState<Herraje | null>(null);
  const [nuevo, setNuevo] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetchWithSupabaseSession("/api/produccion/herrajes?incluir_inactivos=1", { cache: "no-store" }).then((x) => x.json());
      if (r?.success) setRows(r.data.herrajes as Herraje[]); else setError(r?.error ?? "Error");
    } catch { setError("Error de red."); }
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
    fetchWithSupabaseSession("/api/proveedores", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      const arr = (j?.data?.proveedores ?? j?.data ?? []) as Record<string, unknown>[];
      setProvs(arr.map((p) => ({ id: String(p.id), nombre: String(p.nombre ?? p.razon_social ?? "") })).filter((p) => p.nombre));
    }).catch(() => {});
  }, [cargar]);

  const provNombre = (id: string | null) => (id ? provs.find((p) => p.id === id)?.nombre ?? "—" : "—");
  const filtradas = rows.filter((t) => {
    const q = buscar.trim().toLowerCase();
    if (!q) return true;
    return [t.codigo, t.descripcion, t.categoria, t.marca_modelo].some((v) => (v ?? "").toLowerCase().includes(q));
  });

  async function borrar(t: Herraje) {
    if (!confirm(`¿Dar de baja el herraje ${t.codigo}? (queda inactivo, no se borra)`)) return;
    const r = await fetchWithSupabaseSession(`/api/produccion/herrajes/${t.id}`, { method: "DELETE" }).then((x) => x.json());
    if (r?.success) void cargar(); else setError(r?.error ?? "No se pudo dar de baja.");
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Wrench className="h-6 w-6 text-[#4FAEB2]" /> Catálogo de Herrajes</h1>
          <p className="mt-1 text-sm text-slate-500">Herrajes y accesorios para la producción de muebles.</p>
        </div>
        <button type="button" onClick={() => setNuevo(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91]"><Plus className="h-4 w-4" /> Nuevo herraje</button>
      </div>

      <div className="zx-surface mb-4 p-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por código, descripción, categoría o marca…" className={`${input} pl-9`} />
        </div>
      </div>

      <div className="zx-surface overflow-hidden">
        {error ? <p className="px-4 py-8 text-center text-sm text-red-600">{error}</p>
        : cargando ? <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>
        : filtradas.length === 0 ? <p className="px-4 py-12 text-center text-sm text-slate-500">Todavía no hay herrajes cargados.</p>
        : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Código</th>
                  <th className="px-4 py-3 text-left">Descripción</th>
                  <th className="px-4 py-3 text-left">Categoría</th>
                  <th className="px-4 py-3 text-left">Marca / Modelo</th>
                  <th className="px-4 py-3 text-left">Unidad</th>
                  <th className="px-4 py-3 text-left">Proveedor</th>
                  <th className="px-4 py-3 text-right">Stock mín.</th>
                  <th className="px-4 py-3 text-right">Costo ref.</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtradas.map((t) => (
                  <tr key={t.id} className={t.activo ? "hover:bg-slate-50/60" : "bg-slate-50/60 text-slate-400"}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{t.codigo}{!t.activo && <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ring-1 ring-slate-200">Inactivo</span>}</td>
                    <td className="px-4 py-3">{t.descripcion}</td>
                    <td className="px-4 py-3">{t.categoria ?? "—"}</td>
                    <td className="px-4 py-3">{t.marca_modelo ?? "—"}</td>
                    <td className="px-4 py-3">{t.unidad ?? "—"}</td>
                    <td className="px-4 py-3">{provNombre(t.proveedor_id)}</td>
                    <td className="px-4 py-3 text-right">{Number(t.stock_minimo) || 0}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{gs(t.costo_referencia)}</td>
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
        <ModalHerraje herraje={editando} provs={provs} onClose={() => { setNuevo(false); setEditando(null); }} onGuardado={() => { setNuevo(false); setEditando(null); void cargar(); }} />
      )}
    </div>
  );
}

function ModalHerraje({ herraje, provs, onClose, onGuardado }: { herraje: Herraje | null; provs: Prov[]; onClose: () => void; onGuardado: () => void }) {
  const esEdit = !!herraje;
  const [f, setF] = useState({
    codigo: herraje?.codigo ?? "",
    descripcion: herraje?.descripcion ?? "",
    categoria: herraje?.categoria ?? "",
    marca_modelo: herraje?.marca_modelo ?? "",
    especificacion: herraje?.especificacion ?? "",
    unidad: herraje?.unidad ?? "UNIDAD",
    proveedor_id: herraje?.proveedor_id ?? "",
    stock_minimo: herraje?.stock_minimo != null ? String(herraje.stock_minimo) : "",
    costo_referencia: herraje?.costo_referencia != null ? String(herraje.costo_referencia) : "",
    observaciones: herraje?.observaciones ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!f.codigo.trim()) return setErr("El código es obligatorio.");
    if (!f.descripcion.trim()) return setErr("La descripción es obligatoria.");
    setBusy(true); setErr(null);
    const url = esEdit ? `/api/produccion/herrajes/${herraje!.id}` : "/api/produccion/herrajes";
    const r = await fetchWithSupabaseSession(url, { method: esEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    setBusy(false);
    if (!r?.success) return setErr(r?.error ?? "No se pudo guardar.");
    onGuardado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{esEdit ? `Editar herraje ${herraje!.codigo}` : "Nuevo herraje"}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          <div><label className={label}>Código *</label><input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} className={input} /></div>
          <div><label className={label}>Descripción *</label><input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className={input} /></div>
          <div><label className={label}>Categoría</label><input value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} className={input} placeholder="Ej: Bisagras, correderas…" /></div>
          <div><label className={label}>Marca / modelo</label><input value={f.marca_modelo} onChange={(e) => setF({ ...f, marca_modelo: e.target.value })} className={input} /></div>
          <div className="sm:col-span-2"><label className={label}>Especificación</label><input value={f.especificacion} onChange={(e) => setF({ ...f, especificacion: e.target.value })} className={input} /></div>
          <div><label className={label}>Unidad</label><input value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })} className={input} /></div>
          <div><label className={label}>Proveedor preferido</label>
            <select value={f.proveedor_id} onChange={(e) => setF({ ...f, proveedor_id: e.target.value })} className={input}>
              <option value="">— Sin proveedor —</option>
              {provs.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div><label className={label}>Stock mínimo</label><input type="number" value={f.stock_minimo} onChange={(e) => setF({ ...f, stock_minimo: e.target.value })} className={input} placeholder="0" /></div>
          <div><label className={label}>Costo de referencia (Gs.)</label><input type="number" value={f.costo_referencia} onChange={(e) => setF({ ...f, costo_referencia: e.target.value })} className={input} placeholder="0" /></div>
          <div className="sm:col-span-2"><label className={label}>Observaciones</label><input value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} className={input} /></div>
          {err && <p className="sm:col-span-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button type="button" onClick={guardar} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />} {esEdit ? "Guardar cambios" : "Crear herraje"}</button>
        </div>
      </div>
    </div>
  );
}
