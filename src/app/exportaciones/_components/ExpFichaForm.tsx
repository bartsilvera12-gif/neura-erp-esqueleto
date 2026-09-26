"use client";

import { useEffect, useState } from "react";
import PaisSelect from "@/components/ui/PaisSelect";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { ResponsableSelect, inputClass, labelClass, useUsuarios } from "@/components/comex/ui";

export interface ExpFicha {
  cliente_id: string | null;
  cliente_nombre: string;
  pais_destino: string;
  productor: string;
  responsable_id: string | null;
  responsable_nombre: string | null;
  fecha_comprometida_embarque: string;
  fecha_comprometida_entrega: string;
  fecha_embarque: string;
  fecha_entrega: string;
  observaciones: string;
}

export const expFichaVacia = (): ExpFicha => ({
  cliente_id: null,
  cliente_nombre: "",
  pais_destino: "BOLIVIA",
  productor: "",
  responsable_id: null,
  responsable_nombre: null,
  fecha_comprometida_embarque: "",
  fecha_comprometida_entrega: "",
  fecha_embarque: "",
  fecha_entrega: "",
  observaciones: "",
});

export const expFichaAPayload = (f: ExpFicha) => ({
  ...f,
  cliente_nombre: f.cliente_nombre.trim(),
  productor: f.productor.trim() || null,
  fecha_comprometida_embarque: f.fecha_comprometida_embarque || null,
  fecha_comprometida_entrega: f.fecha_comprometida_entrega || null,
  fecha_embarque: f.fecha_embarque || null,
  fecha_entrega: f.fecha_entrega || null,
  observaciones: f.observaciones.trim() || null,
});

type ClienteLista = { id: string; empresa?: string | null; nombre_contacto?: string | null; nombre?: string | null; nombre_facturacion?: string | null; pais?: string | null };
const nombreCliente = (c: ClienteLista) => (c.nombre_facturacion || c.empresa || c.nombre_contacto || c.nombre || "").trim();

/** Ficha de la exportación (alta y edición). */
export default function ExpFichaForm({
  ficha,
  onChange,
  bloqueado,
  mostrarFechasReales = true,
}: {
  ficha: ExpFicha;
  onChange: (f: ExpFicha) => void;
  bloqueado?: boolean;
  mostrarFechasReales?: boolean;
}) {
  const usuarios = useUsuarios();
  const [clientes, setClientes] = useState<ClienteLista[]>([]);
  const [abierto, setAbierto] = useState(false);
  const set = <K extends keyof ExpFicha>(k: K, v: ExpFicha[K]) => onChange({ ...ficha, [k]: v });

  useEffect(() => {
    fetchWithSupabaseSession("/api/clientes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setClientes((Array.isArray(j?.data) ? j.data : j?.data?.clientes ?? []) as ClienteLista[]))
      .catch(() => undefined);
  }, []);

  const t = ficha.cliente_nombre.trim().toLowerCase();
  const sugeridos = (t ? clientes.filter((c) => nombreCliente(c).toLowerCase().includes(t)) : clientes).slice(0, 20);

  return (
    <fieldset disabled={bloqueado} className="grid gap-4 sm:grid-cols-2">
      <div className="relative">
        <label className={labelClass}>Cliente / destinatario *</label>
        <input
          value={ficha.cliente_nombre}
          onChange={(e) => {
            onChange({ ...ficha, cliente_nombre: e.target.value, cliente_id: null });
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          className={inputClass}
          placeholder="Buscá en Clientes o escribilo"
        />
        {ficha.cliente_id && <p className="mt-1 text-[11px] text-emerald-700">Cliente de la lista</p>}
        {abierto && !bloqueado && sugeridos.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {sugeridos.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ ...ficha, cliente_id: c.id, cliente_nombre: nombreCliente(c), pais_destino: (c.pais ?? "").toUpperCase() || ficha.pais_destino });
                  setAbierto(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"
              >
                {nombreCliente(c)}
                {c.pais && <span className="ml-2 text-xs text-slate-400">{c.pais}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className={labelClass}>País de destino *</label>
        <PaisSelect value={ficha.pais_destino} onChange={(v) => set("pais_destino", v)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Responsable *</label>
        <ResponsableSelect
          usuarios={usuarios}
          id={ficha.responsable_id}
          nombre={ficha.responsable_nombre}
          disabled={bloqueado}
          onChange={(id, nombre) => onChange({ ...ficha, responsable_id: id, responsable_nombre: nombre })}
        />
      </div>
      <div>
        <label className={labelClass}>Proveedor / productor relacionado</label>
        <input value={ficha.productor} onChange={(e) => set("productor", e.target.value)} className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:grid-cols-4">
        <div>
          <label className={labelClass}>Embarque comprometido</label>
          <input type="date" value={ficha.fecha_comprometida_embarque} onChange={(e) => set("fecha_comprometida_embarque", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Entrega comprometida</label>
          <input type="date" value={ficha.fecha_comprometida_entrega} onChange={(e) => set("fecha_comprometida_entrega", e.target.value)} className={inputClass} />
        </div>
        {mostrarFechasReales && (
          <>
            <div>
              <label className={labelClass}>Embarque real</label>
              <input type="date" value={ficha.fecha_embarque} onChange={(e) => set("fecha_embarque", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Entrega real</label>
              <input type="date" value={ficha.fecha_entrega} onChange={(e) => set("fecha_entrega", e.target.value)} className={inputClass} />
            </div>
          </>
        )}
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass}>Observaciones</label>
        <textarea value={ficha.observaciones} onChange={(e) => set("observaciones", e.target.value)} rows={2} className={inputClass} />
      </div>
    </fieldset>
  );
}
