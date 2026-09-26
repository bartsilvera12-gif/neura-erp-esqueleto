"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import FichaForm, { fichaAPayload, fichaVacia } from "../_components/FichaForm";
import { Aviso, api, jsonInit } from "@/components/comex/ui";

export default function NuevaImportacionPage() {
  const router = useRouter();
  const [ficha, setFicha] = useState(fichaVacia);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const faltan = [
      !ficha.proveedor_nombre && "proveedor",
      !ficha.responsable_nombre && "responsable",
      !ficha.pais_origen && "país de origen",
    ].filter(Boolean);
    if (faltan.length) return setError(`Completá: ${faltan.join(", ")}.`);
    setSaving(true);
    setError(null);
    try {
      const d = await api<{ id: string }>("/api/importaciones", jsonInit("POST", fichaAPayload(ficha)));
      router.push(`/importaciones/${d.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/importaciones" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Importaciones
      </Link>
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Comercio exterior</p>
        <h1 className="text-2xl font-semibold text-slate-900">Nueva importación</h1>
        <p className="text-sm text-slate-600">
          Datos generales. Después de crearla se cargan la mercadería, los contenedores y los documentos.
        </p>
      </header>
      <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <FichaForm ficha={ficha} onChange={(f) => { setFicha(f); setError(null); }} mostrarFechasLogisticas={false} />
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-3 pt-2">
          <Link href="/importaciones" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancelar
          </Link>
          <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
            {saving ? "Creando…" : "Crear importación"}
          </button>
        </div>
      </form>
    </div>
  );
}
