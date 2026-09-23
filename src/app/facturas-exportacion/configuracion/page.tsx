"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useIsAdmin } from "@/lib/auth/use-is-admin";

export const dynamic = "force-dynamic";

interface Punto {
  id: string;
  establecimiento: string;
  punto_expedicion: string;
  timbrado: string;
  vigencia_desde: string;
  vigencia_hasta: string;
  rango_desde: number;
  rango_hasta: number;
  proximo_numero: number;
  activo: boolean;
  ruc: string | null;
  autoimpresor_nro: string | null;
}
type Edit = Record<keyof Omit<Punto, "id" | "activo">, string> & { activo: boolean };

const input = "zx-surface w-full px-3 py-2 text-sm";
const lbl = "mb-1 block text-xs font-medium text-slate-500";
const aEdit = (p: Punto): Edit => ({
  establecimiento: p.establecimiento,
  punto_expedicion: p.punto_expedicion,
  timbrado: p.timbrado,
  vigencia_desde: p.vigencia_desde?.slice(0, 10) ?? "",
  vigencia_hasta: p.vigencia_hasta?.slice(0, 10) ?? "",
  rango_desde: String(p.rango_desde),
  rango_hasta: String(p.rango_hasta),
  proximo_numero: String(p.proximo_numero),
  ruc: p.ruc ?? "",
  autoimpresor_nro: p.autoimpresor_nro ?? "",
  activo: p.activo,
});
const nuevoVacio: Edit = {
  establecimiento: "001",
  punto_expedicion: "",
  timbrado: "",
  vigencia_desde: "",
  vigencia_hasta: "",
  rango_desde: "1",
  rango_hasta: "5000",
  proximo_numero: "1",
  ruc: "80150840-1",
  autoimpresor_nro: "",
  activo: true,
};

export default function ConfiguracionTimbradoPage() {
  const { isAdmin, loaded } = useIsAdmin();
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [nuevo, setNuevo] = useState<Edit | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  async function cargar() {
    const j = await fetch("/api/facturas-exportacion/config", { credentials: "include", cache: "no-store" }).then((r) => r.json());
    const lista = (j?.data?.config ?? []) as Punto[];
    setPuntos(lista);
    setEdits(Object.fromEntries(lista.map((p) => [p.id, aEdit(p)])));
  }
  useEffect(() => { void cargar(); }, []);

  async function guardar(id: string) {
    const e = edits[id];
    setGuardando(id);
    setMsg(null);
    try {
      const j = await fetch(`/api/facturas-exportacion/config/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...e, rango_desde: Number(e.rango_desde), rango_hasta: Number(e.rango_hasta), proximo_numero: Number(e.proximo_numero) }),
      }).then((r) => r.json());
      if (!j?.success) return setMsg({ tipo: "error", texto: j?.error ?? "No se pudo guardar." });
      setMsg({ tipo: "ok", texto: "Cambios guardados." });
      void cargar();
    } finally {
      setGuardando(null);
    }
  }

  async function crear() {
    if (!nuevo) return;
    setGuardando("nuevo");
    setMsg(null);
    try {
      const j = await fetch("/api/facturas-exportacion/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...nuevo, rango_desde: Number(nuevo.rango_desde), rango_hasta: Number(nuevo.rango_hasta), proximo_numero: Number(nuevo.proximo_numero) }),
      }).then((r) => r.json());
      if (!j?.success) return setMsg({ tipo: "error", texto: j?.error ?? "No se pudo crear." });
      setNuevo(null);
      setMsg({ tipo: "ok", texto: "Punto agregado. Si ya había otro timbrado en ese punto, quedó desactivado." });
      void cargar();
    } finally {
      setGuardando(null);
    }
  }

  if (loaded && !isAdmin) {
    return <div className="zx-surface p-6 text-sm text-slate-600">Solo un administrador puede configurar el timbrado.</div>;
  }

  const campos = (e: Edit, set: (e: Edit) => void, esNuevo: boolean) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label className={lbl}>Timbrado</label>
        <input value={e.timbrado} onChange={(ev) => set({ ...e, timbrado: ev.target.value.replace(/\D/g, "") })} className={input} maxLength={8} />
      </div>
      <div>
        <label className={lbl}>Vigencia desde</label>
        <input type="date" value={e.vigencia_desde} onChange={(ev) => set({ ...e, vigencia_desde: ev.target.value })} className={input} />
      </div>
      <div>
        <label className={lbl}>Vigencia hasta</label>
        <input type="date" value={e.vigencia_hasta} onChange={(ev) => set({ ...e, vigencia_hasta: ev.target.value })} className={input} />
      </div>
      <div>
        <label className={lbl}>Nº de autorización DNIT</label>
        <input value={e.autoimpresor_nro} onChange={(ev) => set({ ...e, autoimpresor_nro: ev.target.value })} className={input} />
      </div>
      {esNuevo && (
        <>
          <div>
            <label className={lbl}>Establecimiento</label>
            <input value={e.establecimiento} onChange={(ev) => set({ ...e, establecimiento: ev.target.value.replace(/\D/g, "") })} className={input} maxLength={3} />
          </div>
          <div>
            <label className={lbl}>Punto de expedición</label>
            <input value={e.punto_expedicion} onChange={(ev) => set({ ...e, punto_expedicion: ev.target.value.replace(/\D/g, "") })} className={input} maxLength={3} placeholder="004" />
          </div>
        </>
      )}
      <div>
        <label className={lbl}>Número desde</label>
        <input type="number" min={1} value={e.rango_desde} onChange={(ev) => set({ ...e, rango_desde: ev.target.value })} className={input} />
      </div>
      <div>
        <label className={lbl}>Número hasta</label>
        <input type="number" min={1} value={e.rango_hasta} onChange={(ev) => set({ ...e, rango_hasta: ev.target.value })} className={input} />
      </div>
      <div>
        <label className={lbl}>Próximo número a usar</label>
        <input type="number" min={1} value={e.proximo_numero} onChange={(ev) => set({ ...e, proximo_numero: ev.target.value })} className={input} />
      </div>
      <div>
        <label className={lbl}>RUC</label>
        <input value={e.ruc} onChange={(ev) => set({ ...e, ruc: ev.target.value })} className={input} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Zentra · Autoimpresor</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Timbrado y numeración</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
            Los datos de la autorización de la DNIT para cada punto de expedición. Zentra no deja facturar fuera de estas
            fechas ni pasado el último número. El próximo número nunca puede volver a uno ya usado.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/facturas-exportacion" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            ← Volver
          </Link>
          {!nuevo && (
            <button onClick={() => setNuevo({ ...nuevoVacio })} className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91]">
              + Agregar punto / timbrado nuevo
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className={`rounded px-3 py-2 text-sm ${msg.tipo === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.texto}</div>
      )}

      {nuevo && (
        <div className="zx-surface space-y-4 border-2 border-[#4FAEB2]/40 p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-slate-800">Nuevo punto o timbrado</h2>
          <p className="text-xs text-slate-500">Usalo cuando la DNIT renueve el timbrado o habilite otro punto. El anterior del mismo punto queda desactivado.</p>
          {campos(nuevo, setNuevo, true)}
          <div className="flex gap-2">
            <button onClick={crear} disabled={guardando === "nuevo"} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
              {guardando === "nuevo" ? "Guardando…" : "Agregar"}
            </button>
            <button onClick={() => setNuevo(null)} className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-50">Cancelar</button>
          </div>
        </div>
      )}

      {[...puntos.filter((x) => x.activo), ...puntos.filter((x) => !x.activo)].map((p, i, lista) => {
        const e = edits[p.id];
        const primeroInactivo = !p.activo && (i === 0 || lista[i - 1].activo);
        if (!e) return null;
        const usados = Math.max(0, p.proximo_numero - p.rango_desde);
        const quedan = Math.max(0, p.rango_hasta - p.proximo_numero + 1);
        return (
          <div key={p.id} className="space-y-3">
          {primeroInactivo && (
            <h2 className="pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Timbrados anteriores (inactivos, no se usan para facturar)
            </h2>
          )}
          <div className={`zx-surface space-y-4 p-4 sm:p-6 ${p.activo ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">
                Punto {p.establecimiento}-{p.punto_expedicion}
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.activo ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                  {p.activo ? "Activo" : "Inactivo"}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Facturas reales usadas: <strong>{usados}</strong> · quedan <strong>{quedan}</strong>
              </p>
            </div>
            {campos(e, (v) => setEdits({ ...edits, [p.id]: v }), false)}
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={e.activo} onChange={(ev) => setEdits({ ...edits, [p.id]: { ...e, activo: ev.target.checked } })} className="rounded" />
                Punto activo (se puede facturar por acá)
              </label>
              <button
                onClick={() => guardar(p.id)}
                disabled={guardando === p.id}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {guardando === p.id ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
          </div>
        );
      })}
    </div>
  );
}
