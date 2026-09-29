"use client";

import { useCallback, useEffect, useState } from "react";
import { Handshake, Plus } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import HistorialPanel from "@/components/comex/HistorialPanel";
import { Aviso, ModalShell, ResponsableSelect, api, btnPrimario, btnSecundario, fechaES, hoyPY, inputClass, jsonInit, labelClass, noRueda, sinFlechas, useUsuarios } from "@/components/comex/ui";

type Compromiso = {
  id: string;
  proveedor_id: string | null;
  proveedor_nombre: string;
  importacion_id: string | null;
  productos: string;
  cantidad: number | null;
  fecha_comprometida: string;
  fecha_real: string | null;
  documentacion_requerida: string | null;
  documentacion_completa: boolean;
  estado: "pendiente" | "cumplido" | "cancelado";
  responsable_id: string | null;
  responsable_nombre: string | null;
  observaciones: string | null;
};

/** Compromisos de proveedores (PDF §7): qué prometió cada uno, para cuándo y si cumplió. */
export default function CompromisosPage() {
  const [lista, setLista] = useState<Compromiso[]>([]);
  const [estado, setEstado] = useState("pendiente");
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Compromiso | "nuevo" | null>(null);
  const hoy = hoyPY();

  const cargar = useCallback(async () => {
    try {
      setLista((await api<{ compromisos: Compromiso[] }>(`/api/comex/compromisos${estado ? `?estado=${estado}` : ""}`)).compromisos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [estado]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Comercio exterior</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Handshake className="h-6 w-6 text-slate-500" /> Compromisos de proveedores
          </h1>
          <p className="text-sm text-slate-600">Qué prometió entregar cada proveedor, para cuándo, y si cumplió a tiempo. Los indicadores están en Reportes.</p>
        </div>
        <button onClick={() => setEditando("nuevo")} className={`${btnPrimario} px-4 py-2 text-sm`}>
          <Plus className="h-4 w-4" /> Nuevo compromiso
        </button>
      </header>
      <div className="flex gap-2">
        {[["pendiente", "Pendientes"], ["cumplido", "Cumplidos"], ["cancelado", "Cancelados"], ["", "Todos"]].map(([k, t]) => (
          <button key={k} onClick={() => setEstado(k)} className={`rounded-full px-3 py-1 text-xs font-medium ${estado === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>
            {t}
          </button>
        ))}
      </div>
      {error && <Aviso>{error}</Aviso>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Qué se comprometió</th>
              <th className="px-4 py-3">Para el</th>
              <th className="px-4 py-3">Entregó</th>
              <th className="px-4 py-3">Documentación</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No hay compromisos.</td>
              </tr>
            )}
            {lista.map((c) => {
              const atrasado = c.estado === "pendiente" && c.fecha_comprometida < hoy;
              const tarde = c.estado === "cumplido" && c.fecha_real && c.fecha_real > c.fecha_comprometida;
              return (
                <tr key={c.id} onClick={() => setEditando(c)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.proveedor_nombre}</td>
                  <td className="px-4 py-3">
                    {c.productos}
                    {c.cantidad ? <span className="text-slate-500"> · {Number(c.cantidad).toLocaleString("es-PY")}</span> : null}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap ${atrasado ? "font-semibold text-rose-600" : ""}`}>
                    {fechaES(c.fecha_comprometida)}
                    {atrasado && <div className="text-[11px]">atrasado</div>}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap ${tarde ? "text-amber-700" : ""}`}>
                    {c.fecha_real ? fechaES(c.fecha_real) : "—"}
                    {tarde && <div className="text-[11px]">con demora</div>}
                  </td>
                  <td className="px-4 py-3 text-xs">{c.documentacion_completa ? "Completa" : c.documentacion_requerida ? "Pendiente" : "—"}</td>
                  <td className="px-4 py-3 text-xs font-semibold">{c.estado === "pendiente" ? "Pendiente" : c.estado === "cumplido" ? "Cumplido" : "Cancelado"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editando && (
        <ModalCompromiso
          c={editando === "nuevo" ? null : editando}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function ModalCompromiso({ c, onClose, onSaved }: { c: Compromiso | null; onClose: () => void; onSaved: () => void }) {
  const usuarios = useUsuarios();
  const [provs, setProvs] = useState<{ id: string; nombre: string }[]>([]);
  const [f, setF] = useState({
    proveedor_id: c?.proveedor_id ?? "",
    proveedor_nombre: c?.proveedor_nombre ?? "",
    productos: c?.productos ?? "",
    cantidad: c?.cantidad ? String(c.cantidad) : "",
    fecha_comprometida: c?.fecha_comprometida ?? "",
    fecha_real: c?.fecha_real ?? "",
    documentacion_requerida: c?.documentacion_requerida ?? "",
    documentacion_completa: c?.documentacion_completa ?? false,
    observaciones: c?.observaciones ?? "",
    estado: c?.estado ?? "pendiente",
  });
  const [resp, setResp] = useState<{ id: string | null; nombre: string | null }>({ id: c?.responsable_id ?? null, nombre: c?.responsable_nombre ?? null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchWithSupabaseSession("/api/proveedores", { cache: "no-store" }).then((r) => r.json()).then((j) => setProvs(j.data?.proveedores ?? [])).catch(() => undefined);
  }, []);
  const set = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });
  return (
    <ModalShell title={c ? `Compromiso de ${c.proveedor_nombre}` : "Nuevo compromiso"} onClose={onClose} ancho="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelClass}>Proveedor *</label>
            <select
              value={f.proveedor_id}
              onChange={(e) => {
                const p = provs.find((x) => x.id === e.target.value);
                setF({ ...f, proveedor_id: p?.id ?? "", proveedor_nombre: p?.nombre ?? "" });
              }}
              className={inputClass}
            >
              <option value="">— Elegir —</option>
              {c && !provs.some((p) => p.id === c.proveedor_id) && <option value={c.proveedor_id ?? ""}>{c.proveedor_nombre}</option>}
              {provs.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Qué se comprometió a entregar *</label>
            <input value={f.productos} onChange={(e) => set("productos", e.target.value)} placeholder="Ej.: 40 sofás modelo X" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Cantidad</label>
            <input type="number" min={0} step="any" value={f.cantidad} onWheel={noRueda} onChange={(e) => set("cantidad", e.target.value)} className={`${inputClass} ${sinFlechas} text-right`} />
          </div>
          <div>
            <label className={labelClass}>Fecha comprometida *</label>
            <input type="date" value={f.fecha_comprometida} onChange={(e) => set("fecha_comprometida", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Fecha real de entrega</label>
            <input type="date" value={f.fecha_real} onChange={(e) => set("fecha_real", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Responsable</label>
            <ResponsableSelect usuarios={usuarios} id={resp.id} nombre={resp.nombre} onChange={(id, nombre) => setResp({ id, nombre })} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Documentación requerida</label>
            <input value={f.documentacion_requerida} onChange={(e) => set("documentacion_requerida", e.target.value)} placeholder="Ej.: factura, packing list, certificado de origen" className={inputClass} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.documentacion_completa} onChange={(e) => set("documentacion_completa", e.target.checked)} /> Documentación completa
          </label>
          <div className="col-span-2">
            <label className={labelClass}>Observaciones / incidentes</label>
            <textarea value={f.observaciones} onChange={(e) => set("observaciones", e.target.value)} rows={2} className={inputClass} />
          </div>
          {c && (
            <div>
              <label className={labelClass}>Estado</label>
              <select value={f.estado} onChange={(e) => set("estado", e.target.value)} className={inputClass}>
                <option value="pendiente">Pendiente</option>
                <option value="cumplido">Cumplido</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          )}
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnSecundario}>Cancelar</button>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const body = { ...f, responsable_id: resp.id, responsable_nombre: resp.nombre };
                if (c) await api(`/api/comex/compromisos/${c.id}`, jsonInit("PATCH", body));
                else await api("/api/comex/compromisos", jsonInit("POST", body));
                onSaved();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Error");
                setSaving(false);
              }
            }}
            className={btnPrimario}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
        {c && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-medium text-slate-500">Historial</summary>
            <div className="mt-2">
              <HistorialPanel origenTipo="COMPROMISO" origenId={c.id} />
            </div>
          </details>
        )}
      </div>
    </ModalShell>
  );
}
