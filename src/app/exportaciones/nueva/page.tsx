"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import ExpFichaForm, { expFichaAPayload, expFichaVacia } from "../_components/ExpFichaForm";
import { Aviso, api, inputClass, jsonInit, labelClass } from "@/components/comex/ui";

export default function NuevaExportacionPage() {
  const router = useRouter();
  const { isAdmin } = useIsAdmin();
  const [ficha, setFicha] = useState(expFichaVacia);
  const [sinProforma, setSinProforma] = useState(false);
  const [motivo, setMotivo] = useState("Contenedor Sarasota");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const faltan = [!ficha.cliente_nombre.trim() && "cliente", !ficha.pais_destino && "país de destino", !ficha.responsable_nombre && "responsable"].filter(Boolean);
    if (faltan.length) return setError(`Completá: ${faltan.join(", ")}.`);
    if (sinProforma && !motivo.trim()) return setError("Indicá por qué no lleva proforma.");
    setSaving(true);
    setError(null);
    try {
      const d = await api<{ id: string }>(
        "/api/exportaciones",
        jsonInit("POST", { ...expFichaAPayload(ficha), requiere_proforma: !sinProforma, motivo_sin_proforma: sinProforma ? motivo : null })
      );
      router.push(`/exportaciones/${d.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/exportaciones" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Exportaciones
      </Link>
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Comercio exterior</p>
        <h1 className="text-2xl font-semibold text-slate-900">Nueva exportación</h1>
        <p className="text-sm text-slate-600">
          El envío: a quién, a dónde y cuándo. La factura se hace en Facturación y después se vincula acá.
        </p>
      </header>
      <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <ExpFichaForm ficha={ficha} onChange={(f) => { setFicha(f); setError(null); }} mostrarFechasReales={false} />
        <div className="rounded-lg border border-slate-200 p-4">
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={sinProforma} disabled={!isAdmin} onChange={(e) => setSinProforma(e.target.checked)} className="mt-0.5" />
            <span>
              <strong>Esta operación no lleva proforma</strong> (por ejemplo, contenedores Sarasota).
              {!isAdmin && <span className="block text-xs text-slate-500">Solo un administrador puede marcarlo.</span>}
            </span>
          </label>
          {sinProforma && (
            <div className="mt-3">
              <label className={labelClass}>Motivo *</label>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputClass} />
            </div>
          )}
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-3 pt-2">
          <Link href="/exportaciones" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancelar
          </Link>
          <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
            {saving ? "Creando…" : "Crear exportación"}
          </button>
        </div>
      </form>
    </div>
  );
}
