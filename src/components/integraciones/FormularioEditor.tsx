"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { CampoFormulario, FormularioApi } from "@/lib/integraciones/types";
import { Plus, Trash2 } from "lucide-react";

const TIPOS: CampoFormulario["type"][] = ["text", "textarea", "number", "email", "tel", "date", "checkbox", "select"];

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

export default function FormularioEditor({ inicial }: { inicial?: FormularioApi | null }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const [endpoint, setEndpoint] = useState(inicial?.endpoint_url ?? "");
  const [metodo, setMetodo] = useState<FormularioApi["metodo"]>(inicial?.metodo ?? "POST");
  const [authName, setAuthName] = useState(inicial?.auth_header_name ?? "");
  const [authValue, setAuthValue] = useState(inicial?.auth_header_value ?? "");
  const [activo, setActivo] = useState<boolean>(inicial?.activo ?? true);
  const [campos, setCampos] = useState<CampoFormulario[]>(inicial?.campos ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addCampo() {
    setCampos((c) => [...c, { name: `campo_${c.length + 1}`, label: "Nuevo campo", type: "text", required: false }]);
  }
  function upd(idx: number, patch: Partial<CampoFormulario>) {
    setCampos((c) => c.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }
  function del(idx: number) {
    setCampos((c) => c.filter((_, i) => i !== idx));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        nombre,
        descripcion: descripcion || undefined,
        endpoint_url: endpoint,
        metodo,
        auth_header_name: authName || undefined,
        auth_header_value: authValue || undefined,
        campos,
        activo,
      };
      const url = inicial ? `/api/integraciones/formularios/${inicial.id}` : "/api/integraciones/formularios";
      const r = await fetchWithSupabaseSession(url, {
        method: inicial ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `Error ${r.status}`);
      router.push("/integraciones");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Conexión</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Nombre *</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} required />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Descripción</label>
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Endpoint URL *</label>
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className={inputClass}
              placeholder="https://api.ejemplo.com/webhook"
              required
            />
          </div>
          <div>
            <label className={labelClass}>Método</label>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value as FormularioApi["metodo"])} className={inputClass}>
              {(["POST", "GET", "PUT", "PATCH", "DELETE"] as const).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Estado</label>
            <select value={activo ? "1" : "0"} onChange={(e) => setActivo(e.target.value === "1")} className={inputClass}>
              <option value="1">Activo</option>
              <option value="0">Inactivo</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Header de auth (nombre)</label>
            <input
              value={authName}
              onChange={(e) => setAuthName(e.target.value)}
              className={inputClass}
              placeholder="Authorization"
            />
          </div>
          <div>
            <label className={labelClass}>Header de auth (valor)</label>
            <input
              value={authValue}
              onChange={(e) => setAuthValue(e.target.value)}
              className={inputClass}
              placeholder="Bearer …"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Campos del formulario</h2>
          <button type="button" onClick={addCampo} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
            <Plus className="h-3.5 w-3.5" /> Añadir campo
          </button>
        </div>
        {campos.length === 0 && (
          <p className="text-sm text-slate-500">Todavía no hay campos. Añadí al menos uno.</p>
        )}
        <div className="space-y-3">
          {campos.map((c, i) => (
            <div key={i} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <label className={labelClass}>Etiqueta</label>
                <input value={c.label} onChange={(e) => upd(i, { label: e.target.value })} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Nombre (clave)</label>
                <input value={c.name} onChange={(e) => upd(i, { name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Tipo</label>
                <select value={c.type} onChange={(e) => upd(i, { type: e.target.value as CampoFormulario["type"] })} className={inputClass}>
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={!!c.required}
                    onChange={(e) => upd(i, { required: e.target.checked })}
                  />
                  Requerido
                </label>
                <button type="button" onClick={() => del(i)} className="rounded p-1 text-rose-600 hover:bg-rose-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push("/integraciones")}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
