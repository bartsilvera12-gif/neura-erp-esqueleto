"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { Aviso, ModalShell, ResponsableSelect, api, btnPrimario, btnSecundario, fechaHora, inputClass, jsonInit, labelClass, useUsuarios } from "@/components/comex/ui";

type Conteo = {
  id: string;
  numero: string;
  ubicacion_nombre: string | null;
  pais: string | null;
  sector: string | null;
  categoria_nombre: string | null;
  responsable_nombre: string;
  estado: "en_curso" | "cerrado" | "ajustado" | "anulado";
  created_at: string;
  total: number;
  contados: number;
  diferencias: number;
};
const ESTADO: Record<Conteo["estado"], { t: string; c: string }> = {
  en_curso: { t: "Contando", c: "bg-sky-50 text-sky-700 ring-1 ring-sky-200" },
  cerrado: { t: "Cerrado · falta ajustar", c: "bg-amber-50 text-amber-800 ring-1 ring-amber-200" },
  ajustado: { t: "Ajustado", c: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  anulado: { t: "Anulado", c: "bg-rose-50 text-rose-700 ring-1 ring-rose-200" },
};

/** Inventario físico (PDF §6): conteos por depósito; el ajuste de stock lo aprueba un admin. */
export default function InventarioFisicoPage() {
  const [conteos, setConteos] = useState<Conteo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setConteos((await api<{ conteos: Conteo[] }>("/api/comex/conteos")).conteos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Comercio exterior</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <ClipboardList className="h-6 w-6 text-slate-500" /> Inventario físico
          </h1>
          <p className="text-sm text-slate-600">Contar lo que hay en el depósito y compararlo con el sistema. Contar no cambia el stock: el ajuste lo hace un administrador.</p>
        </div>
        <button onClick={() => setNuevo(true)} className={`${btnPrimario} px-4 py-2 text-sm`}>
          <Plus className="h-4 w-4" /> Nuevo conteo
        </button>
      </header>
      {error && <Aviso>{error}</Aviso>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Depósito</th>
              <th className="px-4 py-3">Responsable</th>
              <th className="px-4 py-3">Avance</th>
              <th className="px-4 py-3">Diferencias</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {conteos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">Todavía no hay conteos.</td>
              </tr>
            )}
            {conteos.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/comex/inventario-fisico/${c.id}`} className="font-mono text-emerald-700 hover:underline">{c.numero}</Link>
                  <div className="text-[11px] text-slate-400">{fechaHora(c.created_at)}</div>
                </td>
                <td className="px-4 py-3">
                  {c.ubicacion_nombre} <span className="text-xs text-slate-400">({c.pais ?? "PY"})</span>
                  <div className="text-[11px] text-slate-400">{[c.sector, c.categoria_nombre].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="px-4 py-3">{c.responsable_nombre}</td>
                <td className="px-4 py-3">
                  {c.contados} de {c.total}
                  <div className="mt-1 h-1.5 w-28 rounded bg-slate-100">
                    <div className="h-1.5 rounded bg-emerald-500" style={{ width: `${c.total ? (c.contados / c.total) * 100 : 0}%` }} />
                  </div>
                </td>
                <td className={`px-4 py-3 ${c.diferencias ? "font-semibold text-rose-700" : "text-slate-500"}`}>{c.diferencias}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ESTADO[c.estado].c}`}>{ESTADO[c.estado].t}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nuevo && <ModalNuevoConteo onClose={() => setNuevo(false)} />}
    </div>
  );
}

function ModalNuevoConteo({ onClose }: { onClose: () => void }) {
  const usuarios = useUsuarios();
  const [ubis, setUbis] = useState<{ id: string; nombre: string; pais: string | null; tipo?: string }[]>([]);
  const [cats, setCats] = useState<{ id: string; nombre: string }[]>([]);
  const [f, setF] = useState({ ubicacion_id: "", sector: "", categoria_id: "", observaciones: "" });
  const [resp, setResp] = useState<{ id: string | null; nombre: string | null }>({ id: null, nombre: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchWithSupabaseSession("/api/inventario/ubicaciones?todas=1", { cache: "no-store" }).then((r) => r.json()).then((j) => setUbis(j.data?.ubicaciones ?? [])).catch(() => undefined);
    fetchWithSupabaseSession("/api/inventario/categorias", { cache: "no-store" }).then((r) => r.json()).then((j) => setCats(j.data?.categorias ?? [])).catch(() => undefined);
  }, []);
  return (
    <ModalShell title="Nuevo conteo físico" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Se arma la lista con los productos activos del depósito y se guarda el stock que dice el sistema en este momento.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelClass}>Depósito *</label>
            <select value={f.ubicacion_id} onChange={(e) => setF({ ...f, ubicacion_id: e.target.value })} className={inputClass}>
              <option value="">— Elegir —</option>
              {ubis.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre} ({u.pais ?? "PY"})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Sector / ubicación</label>
            <input value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} placeholder="Ej.: Galpón 2" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Solo una categoría</label>
            <select value={f.categoria_id} onChange={(e) => setF({ ...f, categoria_id: e.target.value })} className={inputClass}>
              <option value="">Todas</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Responsable *</label>
            <ResponsableSelect usuarios={usuarios} id={resp.id} nombre={resp.nombre} onChange={(id, nombre) => setResp({ id, nombre })} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Observaciones</label>
            <input value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} className={inputClass} />
          </div>
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
                const d = await api<{ id: string }>("/api/comex/conteos", jsonInit("POST", { ...f, responsable_id: resp.id, responsable_nombre: resp.nombre }));
                window.location.href = `/comex/inventario-fisico/${d.id}`;
              } catch (e) {
                setError(e instanceof Error ? e.message : "Error");
                setSaving(false);
              }
            }}
            className={btnPrimario}
          >
            {saving ? "Armando la lista…" : "Empezar conteo"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
