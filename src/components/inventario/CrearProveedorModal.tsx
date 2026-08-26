"use client";

import { useState } from "react";
import ModalBase from "@/components/ui/ModalBase";

export interface ProveedorCreado {
  id: string;
  nombre: string;
}

/**
 * Alta rápida de proveedor desde el formulario de producto.
 *
 * Mismo motivo que `CrearCategoriaModal`: el "+ Crear" era un link a
 * /proveedores/nuevo y salir de la pantalla perdía el producto a medio cargar.
 *
 * Pide lo mínimo para poder asociarlo. El resto de la ficha (dirección,
 * condición de pago, moneda, observaciones) se completa después en Proveedores.
 */
export default function CrearProveedorModal({
  onClose,
  onCreado,
}: {
  onClose: () => void;
  onCreado: (proveedor: ProveedorCreado) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [ruc, setRuc] = useState("");
  const [telefono, setTelefono] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const n = nombre.trim();
    if (!n) {
      setErr("La razón social / nombre es obligatoria.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/proveedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nombre: n,
          ruc: ruc.trim() || null,
          telefono: telefono.trim() || null,
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) {
        setErr(j?.error ?? "No se pudo crear el proveedor.");
        setBusy(false);
        return;
      }
      const prov = j.data?.proveedor as { id: string; nombre: string } | undefined;
      if (!prov?.id) {
        setErr("No se pudo crear el proveedor.");
        setBusy(false);
        return;
      }
      onCreado({ id: prov.id, nombre: prov.nombre });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error de red");
      setBusy(false);
    }
  }

  const inputClass =
    "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]/30 focus:border-[#4FAEB2] disabled:bg-slate-50";
  const labelClass =
    "block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide";

  return (
    <ModalBase
      title="Nuevo proveedor"
      subtitle="Se crea sin salir del formulario y queda seleccionado."
      onClose={busy ? () => {} : onClose}
    >
      <div className="p-5 space-y-4">
        <div>
          <label className={labelClass}>
            Razón social / nombre <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: DISTRIBUIDORA SAN JOSÉ S.A."
            disabled={busy}
            className={`${inputClass} uppercase`}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>RUC</label>
            <input
              type="text"
              value={ruc}
              onChange={(e) => setRuc(e.target.value)}
              placeholder="Ej: 80012345-6"
              disabled={busy}
              className={`${inputClass} uppercase`}
            />
          </div>
          <div>
            <label className={labelClass}>Teléfono</label>
            <input
              type="text"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Ej: 0981 123 456"
              disabled={busy}
              className={inputClass}
            />
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          El resto de la ficha (dirección, condición de pago, moneda) se completa
          después desde Compras → Proveedores.
        </p>

        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{err}</p>
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !nombre.trim()}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#4FAEB2] hover:bg-[#3F8E91] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Creando…" : "Crear proveedor"}
        </button>
      </div>
    </ModalBase>
  );
}
