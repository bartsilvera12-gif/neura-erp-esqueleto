"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { CampoFormulario, FormularioApi } from "@/lib/integraciones/types";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

type Valor = string | number | boolean;

function defaultValor(c: CampoFormulario): Valor {
  if (c.default !== undefined && c.default !== null) return c.default as Valor;
  if (c.type === "checkbox") return false;
  if (c.type === "number") return "";
  return "";
}

export default function EjecutarFormularioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [form, setForm] = useState<FormularioApi | null>(null);
  const [values, setValues] = useState<Record<string, Valor>>({});
  const [respuesta, setRespuesta] = useState<{ status: number; respuesta: unknown; error: string | null } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithSupabaseSession(`/api/integraciones/formularios/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.success) throw new Error(j?.error ?? "Error");
        const f = j.data.formulario as FormularioApi;
        setForm(f);
        const init: Record<string, Valor> = {};
        for (const c of f.campos ?? []) init[c.name] = defaultValor(c);
        setValues(init);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSending(true);
    setRespuesta(null);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/integraciones/formularios/${id}/ejecutar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: values }),
      });
      const j = await r.json().catch(() => ({}));
      setRespuesta(j.data ?? { status: 0, respuesta: null, error: j?.error ?? `Error ${r.status}` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/integraciones"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Integraciones
      </Link>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {!form && !error && <p className="text-sm text-slate-500">Cargando…</p>}
      {form && (
        <>
          <header>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Zentra · Integraciones
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">{form.nombre}</h1>
            {form.descripcion && <p className="text-sm text-slate-600">{form.descripcion}</p>}
            <p className="mt-1 text-xs text-slate-500">
              <span className="font-semibold">{form.metodo}</span> {form.endpoint_url}
            </p>
          </header>

          <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            {(form.campos ?? []).map((c) => (
              <div key={c.name}>
                <label className={labelClass}>
                  {c.label}
                  {c.required && <span className="ml-1 text-rose-600">*</span>}
                </label>
                {c.type === "textarea" ? (
                  <textarea
                    value={String(values[c.name] ?? "")}
                    onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}
                    required={!!c.required}
                    placeholder={c.placeholder}
                    className={inputClass}
                    rows={3}
                  />
                ) : c.type === "checkbox" ? (
                  <input
                    type="checkbox"
                    checked={!!values[c.name]}
                    onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.checked }))}
                  />
                ) : c.type === "select" ? (
                  <select
                    value={String(values[c.name] ?? "")}
                    onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}
                    required={!!c.required}
                    className={inputClass}
                  >
                    <option value="">— Seleccionar —</option>
                    {(c.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={c.type}
                    value={String(values[c.name] ?? "")}
                    onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}
                    required={!!c.required}
                    placeholder={c.placeholder}
                    className={inputClass}
                  />
                )}
              </div>
            ))}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={sending}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {sending ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </form>

          {respuesta && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    respuesta.error
                      ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                      : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  }`}
                >
                  HTTP {respuesta.status || "?"}
                </span>
                {respuesta.error && <span className="text-sm text-rose-700">{respuesta.error}</span>}
              </div>
              <pre className="overflow-auto rounded bg-slate-50 p-3 text-xs">
                {typeof respuesta.respuesta === "string"
                  ? respuesta.respuesta
                  : JSON.stringify(respuesta.respuesta, null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
