"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, Ship } from "lucide-react";
import ConfirmModal from "@/components/ui/ConfirmModal";
import type { EstadoExportacion, Exportacion } from "@/lib/exportaciones/types";
import { ESTADO_EXPORTACION_LABEL } from "@/lib/comex/estados";
import { Aviso, api, fechaES, inputClass, labelClass, nombreDe, useUsuarios } from "@/components/comex/ui";

const ESTADO_BADGE: Record<EstadoExportacion, string> = {
  preparacion: "bg-slate-100 text-slate-700",
  documentacion: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  aprobada: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  despachada: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  entregada: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  cerrada: "bg-slate-50 text-slate-500 ring-1 ring-slate-200",
  anulada: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
};

export default function ExportacionesPage() {
  const usuarios = useUsuarios();
  const [rows, setRows] = useState<Exportacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({ estado: "", responsable: "", q: "" });
  const [borrar, setBorrar] = useState<Exportacion | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v));
      const d = await api<{ exportaciones: Exportacion[] }>(`/api/exportaciones?${qs}`);
      setRows(d.exportaciones);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  async function confirmarBorrar() {
    if (!borrar) return;
    try {
      await api(`/api/exportaciones/${borrar.id}`, { method: "DELETE" });
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar.");
    }
    setBorrar(null);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Comercio exterior</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Ship className="h-6 w-6 text-slate-500" /> Exportaciones
          </h1>
          <p className="text-sm text-slate-600">
            Cada envío al exterior con su factura, su nota de remisión, contenedores, documentos y el control antes del despacho.
          </p>
        </div>
        <Link
          href="/exportaciones/nueva"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> Nueva exportación
        </Link>
      </header>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <div>
          <label className={labelClass}>Estado</label>
          <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })} className={inputClass}>
            <option value="">Todos</option>
            {Object.entries(ESTADO_EXPORTACION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Responsable</label>
          <select value={filtros.responsable} onChange={(e) => setFiltros({ ...filtros, responsable: e.target.value })} className={inputClass}>
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {nombreDe(u)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Buscar</label>
          <input value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} className={inputClass} placeholder="Número o cliente" />
        </div>
      </div>

      {error && <Aviso>{error}</Aviso>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Destino</th>
              <th className="px-4 py-3">Responsable</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Embarque comprometido</th>
              <th className="px-4 py-3">Papeles</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No hay exportaciones{filtros.estado || filtros.responsable || filtros.q ? " con esos filtros" : ". Creá una para arrancar"}.
                </td>
              </tr>
            )}
            {rows.map((e) => {
              const atrasada =
                e.fecha_comprometida_embarque &&
                !e.fecha_embarque &&
                !["despachada", "entregada", "cerrada", "anulada"].includes(e.estado) &&
                e.fecha_comprometida_embarque < new Date().toISOString().slice(0, 10);
              return (
                <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/exportaciones/${e.id}`} className="font-mono text-emerald-700 hover:underline">
                      {e.numero}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-800">{e.cliente_nombre}</td>
                  <td className="px-4 py-3 text-slate-600">{e.pais_destino}</td>
                  <td className="px-4 py-3 text-slate-600">{e.responsable_nombre}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ESTADO_BADGE[e.estado]}`}>{ESTADO_EXPORTACION_LABEL[e.estado]}</span>
                  </td>
                  <td className={`px-4 py-3 text-xs ${atrasada ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                    {fechaES(e.fecha_comprometida_embarque)}
                    {atrasada && " · atrasada"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <div>Factura: {e.factura_id ? "✓" : "—"}</div>
                    <div>Remisión: {e.nota_remision_id ? "✓" : "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <Link href={`/exportaciones/${e.id}`} className="text-xs font-medium text-sky-700 hover:underline">
                        Abrir
                      </Link>
                      {e.estado === "preparacion" && (
                        <button type="button" onClick={() => setBorrar(e)} className="text-xs font-medium text-rose-600 hover:underline">
                          Borrar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={!!borrar}
        title="Borrar exportación"
        message={`¿Borrar ${borrar?.numero}? Solo se puede si está vacía; si ya tiene datos, se anula desde adentro.`}
        confirmLabel="Borrar"
        tone="danger"
        onConfirm={() => void confirmarBorrar()}
        onCancel={() => setBorrar(null)}
      />
    </div>
  );
}
