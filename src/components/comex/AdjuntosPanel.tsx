"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Paperclip } from "lucide-react";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { AdjuntoComex, OrigenComex } from "@/lib/comex/types";
import { Aviso, api, btnPrimario, fechaHora, inputClass, labelClass } from "./ui";

const CATEGORIAS_IMPORTACION = [
  "Factura del proveedor",
  "Proforma",
  "Packing list",
  "Conocimiento de embarque",
  "Despacho aduanero",
  "Certificado de origen",
  "Seguro",
  "Fotos",
  "Otro",
];
const CATEGORIAS_EXPORTACION = [
  "Proforma",
  "Packing list",
  "Conocimiento de embarque",
  "Despacho aduanero",
  "Certificado de origen",
  "Seguro",
  "Fotos",
  "Otro",
];

/** Documentos de una operación: subir, abrir y quitar. */
export default function AdjuntosPanel({
  origenTipo,
  origenId,
  bloqueado,
  sinQuitar,
}: {
  origenTipo: OrigenComex;
  origenId: string;
  /** No se sube ni se quita nada (operación cerrada o anulada). */
  bloqueado?: boolean;
  /** Se puede subir pero no quitar (exportación con despacho aprobado). */
  sinQuitar?: boolean;
}) {
  const [lista, setLista] = useState<AdjuntoComex[]>([]);
  const CATEGORIAS = origenTipo === "EXPORTACION" ? CATEGORIAS_EXPORTACION : CATEGORIAS_IMPORTACION;
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quitar, setQuitar] = useState<AdjuntoComex | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    try {
      const d = await api<{ adjuntos: AdjuntoComex[] }>(`/api/comex/adjuntos?origen_tipo=${origenTipo}&origen_id=${origenId}`);
      setLista(d.adjuntos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [origenTipo, origenId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function subir(files: FileList | null) {
    if (!files?.length) return;
    setSubiendo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("origen_tipo", origenTipo);
      fd.append("origen_id", origenId);
      fd.append("categoria", categoria);
      Array.from(files).forEach((f) => fd.append("file", f));
      const r = await fetchWithSupabaseSession("/api/comex/adjuntos", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.error ?? "No se pudo subir.");
      if (j.data?.errores?.length) setError(j.data.errores.join(" "));
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmarQuitar() {
    if (!quitar) return;
    try {
      await api(`/api/comex/adjuntos?id=${quitar.id}`, { method: "DELETE" });
      setQuitar(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setQuitar(null);
    }
  }

  return (
    <section className="space-y-3">
      {!bloqueado && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="min-w-[220px]">
            <label className={labelClass}>Tipo de documento</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputClass}>
              {CATEGORIAS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <label className={`${btnPrimario} cursor-pointer`}>
            <Paperclip className="h-3.5 w-3.5" /> {subiendo ? "Subiendo…" : "Adjuntar archivo"}
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              disabled={subiendo}
              accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.txt"
              onChange={(e) => void subir(e.target.files)}
            />
          </label>
          <p className="text-xs text-slate-400">PDF, imagen, Word o Excel · hasta 25 MB</p>
        </div>
      )}
      {error && <Aviso>{error}</Aviso>}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {lista.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No hay documentos.</p>}
        {lista.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 first:border-t-0">
            <div className="flex min-w-0 items-center gap-3">
              <FileText className="h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <a href={a.url ?? "#"} target="_blank" rel="noopener" className="block truncate text-sm font-medium text-emerald-700 hover:underline">
                  {a.nombre}
                </a>
                <p className="text-[11px] text-slate-400">
                  {a.categoria ?? "Sin tipo"} · {fechaHora(a.created_at)} · {a.usuario_nombre ?? "—"}
                </p>
              </div>
            </div>
            {!bloqueado && !sinQuitar && (
              <button onClick={() => setQuitar(a)} className="text-xs font-medium text-rose-600 hover:underline">
                Quitar
              </button>
            )}
          </div>
        ))}
      </div>
      <ConfirmModal
        open={!!quitar}
        title="Quitar documento"
        message={`¿Quitar "${quitar?.nombre}"? Queda registrado en el historial.`}
        confirmLabel="Quitar"
        tone="danger"
        onConfirm={() => void confirmarQuitar()}
        onCancel={() => setQuitar(null)}
      />
    </section>
  );
}
