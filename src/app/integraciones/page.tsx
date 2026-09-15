"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { Plug, Plus, Play, Pencil, Trash2 } from "lucide-react";
import type { FormularioApi } from "@/lib/integraciones/types";

export default function IntegracionesPage() {
  const [rows, setRows] = useState<FormularioApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/integraciones/formularios", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `Error ${r.status}`);
      setRows((j.data?.formularios ?? []) as FormularioApi[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar el formulario? También borrará el historial de ejecuciones.")) return;
    const r = await fetchWithSupabaseSession(`/api/integraciones/formularios/${id}`, { method: "DELETE" });
    if (r.ok) load();
    else setError(`Error ${r.status}`);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Integraciones</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Plug className="h-6 w-6 text-slate-500" /> Formularios ligados a API
          </h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Configurá formularios que envían sus datos a un endpoint externo (API, webhook, n8n…). Cada envío
            queda registrado en el historial.
          </p>
        </div>
        <Link
          href="/integraciones/nuevo"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> Nuevo formulario
        </Link>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Endpoint</th>
              <th className="px-4 py-3">Método</th>
              <th className="px-4 py-3">Campos</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No hay formularios configurados.
                </td>
              </tr>
            )}
            {rows.map((f) => (
              <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{f.nombre}</div>
                  {f.descripcion && <div className="text-xs text-slate-500">{f.descripcion}</div>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{f.endpoint_url}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    {f.metodo}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{(f.campos ?? []).length}</td>
                <td className="px-4 py-3">
                  {f.activo ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      Activo
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
                      Inactivo
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <Link
                      href={`/integraciones/${f.id}/ejecutar`}
                      className="rounded p-1 text-emerald-700 hover:bg-emerald-50"
                      title="Ejecutar"
                    >
                      <Play className="h-4 w-4" />
                    </Link>
                    <Link
                      href={`/integraciones/${f.id}`}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => eliminar(f.id)}
                      className="rounded p-1 text-rose-600 hover:bg-rose-50"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
