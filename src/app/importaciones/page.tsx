"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { Container, Plus } from "lucide-react";
import type { EstadoImportacion, Importacion } from "@/lib/importaciones/types";

const ESTADO_LABEL: Record<EstadoImportacion, string> = {
  borrador: "Borrador",
  en_transito: "En tránsito",
  arribado: "Arribado",
  nacionalizada: "Nacionalizada",
  entregada: "Entregada",
  cerrada: "Cerrada",
  anulada: "Anulada",
};

const ESTADO_BADGE: Record<EstadoImportacion, string> = {
  borrador: "bg-slate-100 text-slate-700",
  en_transito: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  arribado: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  nacionalizada: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  entregada: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  cerrada: "bg-slate-50 text-slate-500 ring-1 ring-slate-200",
  anulada: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
};

export default function ImportacionesPage() {
  const [rows, setRows] = useState<Importacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/importaciones", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `Error ${r.status}`);
      setRows((j.data?.importaciones ?? []) as Importacion[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Operaciones</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Container className="h-6 w-6 text-slate-500" /> Importaciones
          </h1>
          <p className="text-sm text-slate-600">
            Expediente por operación: proveedor, mercadería esperada, caja en moneda de origen y trazabilidad
            entre almacén exterior y almacén Paraguay.
          </p>
        </div>
        <Link
          href="/importaciones/nueva"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> Nueva importación
        </Link>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Origen</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3">Fechas</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No hay importaciones. Creá una para arrancar.
                </td>
              </tr>
            )}
            {rows.map((imp) => (
              <tr key={imp.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/importaciones/${imp.id}`} className="font-mono text-emerald-700 hover:underline">
                    {imp.numero}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-800">{imp.proveedor_nombre ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{imp.pais_origen}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ESTADO_BADGE[imp.estado]}`}>
                    {ESTADO_LABEL[imp.estado]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">
                  {imp.moneda} {Math.round(imp.monto_estimado).toLocaleString("es-PY")}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  <div>Pedido: {imp.fecha_pedido ?? "—"}</div>
                  <div>Arribo: {imp.fecha_arribo ?? "—"}</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-3">
                    <Link
                      href={`/importaciones/${imp.id}`}
                      className="text-xs font-medium text-sky-700 hover:underline"
                    >
                      Editar
                    </Link>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`¿Eliminar la importación ${imp.numero}? Se borran también sus ítems y movimientos de caja.`)) return;
                        const r = await fetchWithSupabaseSession(`/api/importaciones/${imp.id}`, {
                          method: "DELETE",
                        });
                        const j = await r.json().catch(() => ({}));
                        if (r.ok && (j as { success?: boolean })?.success !== false) {
                          load();
                        } else {
                          window.alert((j as { error?: string })?.error ?? "No se pudo eliminar.");
                        }
                      }}
                      className="text-xs font-medium text-rose-600 hover:underline"
                    >
                      Eliminar
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
