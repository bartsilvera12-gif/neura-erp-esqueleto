"use client";

import { useEffect, useState } from "react";
import PaisSelect from "@/components/ui/PaisSelect";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { ResponsableSelect, hoyPY, inputClass, labelClass, noRueda, sinFlechas, useUsuarios } from "@/components/comex/ui";

export interface Ficha {
  proveedor_id: string | null;
  proveedor_nombre: string;
  pais_origen: string;
  incoterm: string;
  moneda: "USD" | "BOB" | "PYG";
  tipo_cambio: string;
  monto_estimado: string;
  fecha_pedido: string;
  fecha_embarque: string;
  fecha_arribo: string;
  fecha_nacionalizacion: string;
  ubicacion_exterior_id: string;
  ubicacion_destino_py_id: string;
  responsable_id: string | null;
  responsable_nombre: string | null;
  observaciones: string;
}

export const fichaVacia = (): Ficha => ({
  proveedor_id: null,
  proveedor_nombre: "",
  pais_origen: "",
  incoterm: "",
  moneda: "USD",
  tipo_cambio: "",
  monto_estimado: "",
  fecha_pedido: hoyPY(),
  fecha_embarque: "",
  fecha_arribo: "",
  fecha_nacionalizacion: "",
  ubicacion_exterior_id: "",
  ubicacion_destino_py_id: "",
  responsable_id: null,
  responsable_nombre: null,
  observaciones: "",
});

/** Cuerpo para la API: números como número y vacíos como null. */
export const fichaAPayload = (f: Ficha) => ({
  ...f,
  incoterm: f.incoterm.trim() || null,
  tipo_cambio: Number(f.tipo_cambio) || 1,
  monto_estimado: Number(f.monto_estimado) || 0,
  fecha_pedido: f.fecha_pedido || null,
  fecha_embarque: f.fecha_embarque || null,
  fecha_arribo: f.fecha_arribo || null,
  fecha_nacionalizacion: f.fecha_nacionalizacion || null,
  ubicacion_exterior_id: f.ubicacion_exterior_id || null,
  ubicacion_destino_py_id: f.ubicacion_destino_py_id || null,
  observaciones: f.observaciones.trim() || null,
});

type Ubicacion = { id: string; nombre: string; pais: string | null };
type Proveedor = { id: string; nombre: string };

/** Formulario de la ficha de importación (alta y edición). */
export default function FichaForm({
  ficha,
  onChange,
  bloqueado,
  mostrarFechasLogisticas = true,
}: {
  ficha: Ficha;
  onChange: (f: Ficha) => void;
  bloqueado?: boolean;
  mostrarFechasLogisticas?: boolean;
}) {
  const usuarios = useUsuarios();
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const set = <K extends keyof Ficha>(k: K, v: Ficha[K]) => onChange({ ...ficha, [k]: v });

  useEffect(() => {
    fetchWithSupabaseSession("/api/inventario/ubicaciones?todas=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setUbicaciones((j.data?.ubicaciones ?? []) as Ubicacion[]))
      .catch(() => undefined);
    fetchWithSupabaseSession("/api/proveedores", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setProveedores((j.data?.proveedores ?? []) as Proveedor[]))
      .catch(() => undefined);
  }, []);

  const ubicPY = ubicaciones.filter((u) => (u.pais ?? "PY") === "PY");
  const ubicExt = ubicaciones.filter((u) => u.pais && u.pais !== "PY");
  const proveedorConocido = !ficha.proveedor_id || proveedores.some((p) => p.id === ficha.proveedor_id);
  const num = `${inputClass} ${sinFlechas}`;

  return (
    <fieldset disabled={bloqueado} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className={labelClass}>Proveedor *</label>
        <select
          value={ficha.proveedor_id ?? (ficha.proveedor_nombre ? "__manual__" : "")}
          onChange={(e) => {
            if (e.target.value === "__manual__") return;
            const p = proveedores.find((x) => x.id === e.target.value);
            onChange({ ...ficha, proveedor_id: p?.id ?? null, proveedor_nombre: p?.nombre ?? "" });
          }}
          className={inputClass}
        >
          <option value="">— Elegir —</option>
          {!proveedorConocido && <option value={ficha.proveedor_id ?? ""}>{ficha.proveedor_nombre}</option>}
          {!ficha.proveedor_id && ficha.proveedor_nombre && <option value="__manual__">{ficha.proveedor_nombre} (cargado a mano)</option>}
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-slate-400">Si no está, se da de alta en Compras → Proveedores.</p>
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
        <label className={labelClass}>País de origen *</label>
        <PaisSelect value={ficha.pais_origen} onChange={(v) => set("pais_origen", v)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Incoterm</label>
        <input value={ficha.incoterm} onChange={(e) => set("incoterm", e.target.value.toUpperCase())} className={inputClass} placeholder="FOB, CIF, EXW…" />
      </div>
      <div>
        <label className={labelClass}>Moneda</label>
        <select value={ficha.moneda} onChange={(e) => set("moneda", e.target.value as Ficha["moneda"])} className={inputClass}>
          <option value="USD">Dólares (USD)</option>
          <option value="BOB">Bolivianos (BOB)</option>
          <option value="PYG">Guaraníes (PYG)</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Monto estimado</label>
          <input type="number" step="any" min={0} value={ficha.monto_estimado} onWheel={noRueda} onChange={(e) => set("monto_estimado", e.target.value)} className={num} />
        </div>
        <div>
          <label className={labelClass}>Tipo de cambio</label>
          <input type="number" step="any" min={0} value={ficha.tipo_cambio} onWheel={noRueda} onChange={(e) => set("tipo_cambio", e.target.value)} className={num} placeholder="1" />
        </div>
      </div>
      <div>
        <label className={labelClass}>Almacén de origen (exterior)</label>
        <select value={ficha.ubicacion_exterior_id} onChange={(e) => set("ubicacion_exterior_id", e.target.value)} className={inputClass}>
          <option value="">— Ninguno —</option>
          {ubicExt.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre} ({u.pais})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Depósito de destino (Paraguay)</label>
        <select value={ficha.ubicacion_destino_py_id} onChange={(e) => set("ubicacion_destino_py_id", e.target.value)} className={inputClass}>
          <option value="">— Elegir —</option>
          {ubicPY.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className={mostrarFechasLogisticas ? "grid grid-cols-2 gap-3 sm:col-span-2 lg:grid-cols-4" : "grid grid-cols-2 gap-3 sm:col-span-2"}>
        <div>
          <label className={labelClass}>Fecha de pedido</label>
          <input type="date" value={ficha.fecha_pedido} onChange={(e) => set("fecha_pedido", e.target.value)} className={inputClass} />
        </div>
        {mostrarFechasLogisticas && (
          <>
            <div>
              <label className={labelClass}>Fecha de embarque</label>
              <input type="date" value={ficha.fecha_embarque} onChange={(e) => set("fecha_embarque", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Fecha de arribo</label>
              <input type="date" value={ficha.fecha_arribo} onChange={(e) => set("fecha_arribo", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Fecha de nacionalización</label>
              <input type="date" value={ficha.fecha_nacionalizacion} onChange={(e) => set("fecha_nacionalizacion", e.target.value)} className={inputClass} />
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
