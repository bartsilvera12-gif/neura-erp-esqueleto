"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import FormularioEditor from "@/components/integraciones/FormularioEditor";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { FormularioApi } from "@/lib/integraciones/types";

export default function EditarFormularioApiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [inicial, setInicial] = useState<FormularioApi | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithSupabaseSession(`/api/integraciones/formularios/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.success) throw new Error(j?.error ?? "Error");
        setInicial(j.data.formulario as FormularioApi);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [id]);

  return (
    <div className="space-y-6">
      <Link
        href="/integraciones"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Integraciones
      </Link>
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Integraciones</p>
        <h1 className="text-2xl font-semibold text-slate-900">Editar formulario</h1>
      </header>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {!inicial && !error && <p className="text-sm text-slate-500">Cargando…</p>}
      {inicial && <FormularioEditor inicial={inicial} />}
    </div>
  );
}
