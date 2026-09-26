"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import ConfirmModal from "@/components/ui/ConfirmModal";
import type { Importacion, ImportacionItem } from "@/lib/importaciones/types";
import type { Contenedor } from "@/lib/comex/types";
import { ESTADO_CONTENEDOR_LABEL, FLUJO_CONTENEDOR } from "@/lib/comex/estados";
import { Aviso, ModalShell, api, btnPrimario, btnSecundario, fechaES, inputClass, jsonInit, labelClass } from "@/components/comex/ui";

export default function ContenedoresTab({
  imp,
  contenedores,
  items,
  onCambio,
}: {
  imp: Importacion;
  contenedores: Contenedor[];
  items: ImportacionItem[];
  onCambio: () => void;
}) {
  const bloqueado = imp.estado === "cerrada" || imp.estado === "anulada";
  const [modal, setModal] = useState<Contenedor | "nuevo" | null>(null);
  const [quitar, setQuitar] = useState<Contenedor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState<string | null>(null);

  async function mover(c: Contenedor, hacia: string) {
    setMoviendo(c.id);
    setError(null);
    try {
      await api(`/api/comex/contenedores/${c.id}`, jsonInit("PATCH", { estado: hacia }));
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setMoviendo(null);
    }
  }

  async function confirmarQuitar() {
    if (!quitar) return;
    try {
      await api(`/api/comex/contenedores/${quitar.id}`, { method: "DELETE" });
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
    setQuitar(null);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Cada contenedor avanza de a un paso. Queda registrado quién lo movió y cuándo.</p>
        {!bloqueado && (
          <button onClick={() => setModal("nuevo")} className={btnPrimario}>
            <Plus className="h-3.5 w-3.5" /> Agregar contenedor
          </button>
        )}
      </div>
      {error && <Aviso>{error}</Aviso>}
      {contenedores.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Todavía no hay contenedores.</p>
      )}
      {contenedores.map((c) => {
        const i = FLUJO_CONTENEDOR.indexOf(c.estado);
        const sig = FLUJO_CONTENEDOR[i + 1];
        const ant = i > 0 ? FLUJO_CONTENEDOR[i - 1] : null;
        const productos = items.filter((it) => it.contenedor_id === c.id);
        return (
          <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-base font-semibold text-slate-900">{c.numero}</p>
                <p className="text-xs text-slate-500">
                  {c.naviera ?? "Sin naviera"} · Prevista {fechaES(c.fecha_prevista)} · Real {fechaES(c.fecha_real)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {productos.length ? `${productos.length} producto(s): ${productos.map((p) => p.producto_nombre).join(", ")}` : "Sin mercadería asignada"}
                </p>
                {c.observaciones && <p className="mt-1 text-xs text-slate-600">{c.observaciones}</p>}
              </div>
              {!bloqueado && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setModal(c)} className={btnSecundario}>
                    Editar
                  </button>
                  {c.estado === "en_preparacion" && !productos.length && (
                    <button onClick={() => setQuitar(c)} className={`${btnSecundario} text-rose-600`}>
                      Quitar
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Línea de estados */}
            <div className="mt-3 flex flex-wrap items-center gap-1">
              {FLUJO_CONTENEDOR.map((e, k) => (
                <span
                  key={e}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    k < i ? "bg-emerald-50 text-emerald-700" : k === i ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {ESTADO_CONTENEDOR_LABEL[e]}
                </span>
              ))}
            </div>
            {!bloqueado && c.estado !== "cerrado" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {sig && (
                  <button onClick={() => void mover(c, sig)} disabled={moviendo === c.id} className={btnPrimario}>
                    Pasar a {ESTADO_CONTENEDOR_LABEL[sig]}
                  </button>
                )}
                {ant && (
                  <button onClick={() => void mover(c, ant)} disabled={moviendo === c.id} className={btnSecundario}>
                    Volver a {ESTADO_CONTENEDOR_LABEL[ant]}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {modal && <ModalContenedor impId={imp.id} cont={modal === "nuevo" ? null : modal} onClose={() => setModal(null)} onSaved={onCambio} />}
      <ConfirmModal
        open={!!quitar}
        title="Quitar contenedor"
        message={`¿Quitar el contenedor ${quitar?.numero}?`}
        confirmLabel="Quitar"
        tone="danger"
        onConfirm={() => void confirmarQuitar()}
        onCancel={() => setQuitar(null)}
      />
    </section>
  );
}

function ModalContenedor({ impId, cont, onClose, onSaved }: { impId: string; cont: Contenedor | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    numero: cont?.numero ?? "",
    naviera: cont?.naviera ?? "",
    fecha_prevista: cont?.fecha_prevista ?? "",
    fecha_real: cont?.fecha_real ?? "",
    observaciones: cont?.observaciones ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.numero.trim()) return setError("Escribí el número del contenedor.");
    setSaving(true);
    setError(null);
    try {
      if (cont) await api(`/api/comex/contenedores/${cont.id}`, jsonInit("PATCH", f));
      else await api(`/api/importaciones/${impId}/contenedores`, jsonInit("POST", f));
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  }

  return (
    <ModalShell title={cont ? `Contenedor ${cont.numero}` : "Agregar contenedor"} onClose={onClose}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Número *</label>
            <input value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value.toUpperCase() })} className={`${inputClass} font-mono`} placeholder="MSCU1234567" autoFocus />
          </div>
          <div>
            <label className={labelClass}>Naviera / transporte</label>
            <input value={f.naviera} onChange={(e) => setF({ ...f, naviera: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Fecha prevista de llegada</label>
            <input type="date" value={f.fecha_prevista} onChange={(e) => setF({ ...f, fecha_prevista: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Fecha real de llegada</label>
            <input type="date" value={f.fecha_real} onChange={(e) => setF({ ...f, fecha_real: e.target.value })} className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Observaciones</label>
          <textarea value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} rows={2} className={inputClass} />
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={saving} className={btnPrimario}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
