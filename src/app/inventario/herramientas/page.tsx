"use client";

import { useCallback, useEffect, useState } from "react";
import { Wrench, Plus, Pencil, Trash2 } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { ESTADO_LABEL, ESTADOS_HERRAMIENTA, type EstadoHerramienta } from "@/lib/herramientas/types";
import HerramientaModal from "./_components/HerramientaModal";

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

const ESTADO_PILL: Record<EstadoHerramienta, string> = {
  FUNCIONANDO: "bg-emerald-100 text-emerald-700",
  AVERIADA: "bg-rose-100 text-rose-700",
  EN_REPARACION: "bg-amber-100 text-amber-700",
  DADA_DE_BAJA: "bg-slate-200 text-slate-600",
};

export default function HerramientasPage() {
  const [filas, setFilas] = useState<Herramienta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<{ estado: string; q: string }>({ estado: "", q: "" });
  const [edit, setEdit] = useState<Herramienta | null>(null);
  const [nuevo, setNuevo] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const qs = new URLSearchParams();
      if (filtros.estado) qs.set("estado", filtros.estado);
      if (filtros.q.trim()) qs.set("q", filtros.q.trim());
      const r = await fetchWithSupabaseSession(`/api/herramientas?${qs}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { herramientas: Herramienta[] }; error?: string };
      if (!r.ok || !j.success) throw new Error(j.error ?? `Error ${r.status}`);
      setFilas(j.data?.herramientas ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setCargando(false); }
  }, [filtros.estado, filtros.q]);
  useEffect(() => { const t = setTimeout(() => void cargar(), 250); return () => clearTimeout(t); }, [cargar]);

  async function cambiarEstado(h: Herramienta, estado: EstadoHerramienta) {
    const r = await fetchWithSupabaseSession(`/api/herramientas/${h.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setError((j as { error?: string }).error ?? "No se pudo cambiar el estado."); return; }
    await cargar();
  }

  async function eliminar(h: Herramienta) {
    if (!confirm(`¿Eliminar "${h.nombre}" del inventario de herramientas?`)) return;
    const r = await fetchWithSupabaseSession(`/api/herramientas/${h.id}`, { method: "DELETE" });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setError((j as { error?: string }).error ?? "No se pudo eliminar."); return; }
    await cargar();
  }

  const totales = ESTADOS_HERRAMIENTA.reduce<Record<string, number>>((a, e) => ({ ...a, [e]: filas.filter((f) => f.estado === e).length }), {});

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Inventario</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Wrench className="h-6 w-6 text-slate-500" /> Herramientas y máquinas
          </h1>
          <p className="text-sm text-slate-600">Registro y control de estado de herramientas y maquinaria de la empresa.</p>
        </div>
        <button onClick={() => setNuevo(true)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">
          <Plus className="h-4 w-4" /> Nueva herramienta
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ESTADOS_HERRAMIENTA.map((e) => (
          <div key={e} className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ESTADO_LABEL[e]}</p>
            <p className={`mt-1 text-2xl font-semibold ${e === "FUNCIONANDO" ? "text-emerald-700" : e === "AVERIADA" ? "text-rose-700" : e === "EN_REPARACION" ? "text-amber-700" : "text-slate-500"}`}>{totales[e] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Estado</label>
          <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">Todos</option>
            {ESTADOS_HERRAMIENTA.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Buscar</label>
          <input value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} placeholder="Nombre, marca, modelo, serie o ubicación" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Herramienta</th>
              <th className="px-3 py-3">Marca / Modelo</th>
              <th className="px-3 py-3">N° serie</th>
              <th className="px-3 py-3">Ubicación</th>
              <th className="px-3 py-3">Responsable</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando && filas.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Cargando…</td></tr>
            )}
            {!cargando && filas.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No hay herramientas registradas todavía.</td></tr>
            )}
            {filas.map((f) => (
              <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2.5">
                  <div className="font-medium text-slate-800">{f.nombre}</div>
                  {f.categoria && <div className="text-[11px] text-slate-500">{f.categoria}</div>}
                </td>
                <td className="px-3 py-2.5 text-slate-600">{[f.marca, f.modelo].filter(Boolean).join(" · ") || "—"}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{f.numero_serie ?? "—"}</td>
                <td className="px-3 py-2.5 text-slate-600">{f.ubicacion ?? "—"}</td>
                <td className="px-3 py-2.5 text-slate-600">{f.responsable ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <select
                    value={f.estado}
                    onChange={(e) => void cambiarEstado(f, e.target.value as EstadoHerramienta)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold border-none focus:outline-none focus:ring-2 focus:ring-emerald-200 ${ESTADO_PILL[f.estado]}`}
                  >
                    {ESTADOS_HERRAMIENTA.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-1.5">
                    <button onClick={() => setEdit(f)} title="Editar" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-emerald-400 hover:text-emerald-700">
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </button>
                    <button onClick={() => void eliminar(f)} title="Eliminar" className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50">
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(nuevo || edit) && (
        <HerramientaModal
          herramienta={edit}
          onClose={() => { setNuevo(false); setEdit(null); }}
          onSaved={() => { setNuevo(false); setEdit(null); void cargar(); }}
        />
      )}
    </div>
  );
}
