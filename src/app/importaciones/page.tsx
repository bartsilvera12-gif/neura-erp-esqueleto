"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Container, Plus } from "lucide-react";
import ConfirmModal from "@/components/ui/ConfirmModal";
import type { EstadoImportacion, Importacion } from "@/lib/importaciones/types";
import { ESTADO_IMPORTACION_LABEL } from "@/lib/comex/estados";
import { Aviso, api, fechaES, inputClass, labelClass, nombreDe, useUsuarios } from "@/components/comex/ui";

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
  const usuarios = useUsuarios();
  const [rows, setRows] = useState<Importacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({ estado: "", responsable: "", q: "" });
  const [borrar, setBorrar] = useState<Importacion | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v));
      const d = await api<{ importaciones: Importacion[] }>(`/api/importaciones?${qs}`);
      setRows(d.importaciones);
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
      await api(`/api/importaciones/${borrar.id}`, { method: "DELETE" });
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
            <Container className="h-6 w-6 text-slate-500" /> Importaciones
          </h1>
          <p className="text-sm text-slate-600">
            Cada importación desde que se pide hasta que se recibe: mercadería, contenedores, recepción, incidencias y documentos.
          </p>
        </div>
        <Link
          href="/importaciones/nueva"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> Nueva importación
        </Link>
      </header>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <div>
          <label className={labelClass}>Estado</label>
          <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })} className={inputClass}>
            <option value="">Todos</option>
            {Object.entries(ESTADO_IMPORTACION_LABEL).map(([k, v]) => (
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
          <input value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} className={inputClass} placeholder="Número o proveedor" />
        </div>
      </div>

      {error && <Aviso>{error}</Aviso>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Origen</th>
              <th className="px-4 py-3">Responsable</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Fechas</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No hay importaciones{filtros.estado || filtros.responsable || filtros.q ? " con esos filtros" : ". Creá una para arrancar"}.
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
                <td className="px-4 py-3 text-slate-600">{imp.responsable_nombre ?? <span className="text-rose-600">Sin asignar</span>}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ESTADO_BADGE[imp.estado]}`}>
                    {ESTADO_IMPORTACION_LABEL[imp.estado]}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  <div>Pedido: {fechaES(imp.fecha_pedido)}</div>
                  <div>Arribo: {fechaES(imp.fecha_arribo)}</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-3">
                    <Link href={`/importaciones/${imp.id}`} className="text-xs font-medium text-sky-700 hover:underline">
                      Abrir
                    </Link>
                    {imp.estado === "borrador" && (
                      <button type="button" onClick={() => setBorrar(imp)} className="text-xs font-medium text-rose-600 hover:underline">
                        Borrar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={!!borrar}
        title="Borrar importación"
        message={`¿Borrar ${borrar?.numero}? Solo se puede si está vacía; si ya tiene datos, se anula desde adentro.`}
        confirmLabel="Borrar"
        tone="danger"
        onConfirm={() => void confirmarBorrar()}
        onCancel={() => setBorrar(null)}
      />
    </div>
  );
}
