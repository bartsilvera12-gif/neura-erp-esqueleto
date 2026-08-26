"use client";

import { useState } from "react";
import ModalBase from "@/components/ui/ModalBase";

export interface CategoriaCreada {
  id: string;
  nombre: string;
}

/**
 * Alta rápida de categoría desde el formulario de producto.
 *
 * Antes el "+ Crear" era un link a /inventario/categorias: salir de la pantalla
 * significaba perder todo lo cargado del producto. Acá se crea sin navegar y la
 * categoría nueva queda seleccionada al volver.
 *
 * Solo pide el nombre; el resto de los campos de la categoría (código,
 * descripción, jerarquía) se editan después en su propia pantalla. El código lo
 * genera el backend a partir del nombre cuando no se manda.
 */
export default function CrearCategoriaModal({
  onClose,
  onCreada,
}: {
  onClose: () => void;
  onCreada: (categoria: CategoriaCreada) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const n = nombre.trim();
    if (!n) {
      setErr("El nombre es obligatorio.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/inventario/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nombre: n }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) {
        setErr(j?.error ?? "No se pudo crear la categoría.");
        setBusy(false);
        return;
      }
      const cat = j.data?.categoria as { id: string; nombre: string } | undefined;
      if (!cat?.id) {
        setErr("No se pudo crear la categoría.");
        setBusy(false);
        return;
      }
      onCreada({ id: cat.id, nombre: cat.nombre });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error de red");
      setBusy(false);
    }
  }

  return (
    <ModalBase
      title="Nueva categoría"
      subtitle="Se crea sin salir del formulario y queda seleccionada."
      onClose={busy ? () => {} : onClose}
    >
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
            Nombre <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Ej: HERRAMIENTAS"
            disabled={busy}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-[#4FAEB2]/30 focus:border-[#4FAEB2] disabled:bg-slate-50"
          />
        </div>

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
          {busy ? "Creando…" : "Crear categoría"}
        </button>
      </div>
    </ModalBase>
  );
}
