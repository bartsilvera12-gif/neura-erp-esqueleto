"use client";

/** Piezas de pantalla compartidas por Importaciones y Exportaciones. */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-500";
export const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";
export const btnPrimario =
  "inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50";
export const btnSecundario =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
/** Sin flechitas en los inputs numéricos y sin cambiar el valor con la rueda del mouse. */
export const sinFlechas = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
export const noRueda = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

/** fetch a la API propia; devuelve `data` o tira el error en castellano que manda el servidor. */
export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetchWithSupabaseSession(url, { cache: "no-store", ...init });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.success === false) throw new Error(j?.error ?? `Error ${r.status}`);
  return j.data as T;
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Fecha de hoy en Paraguay (AAAA-MM-DD); toISOString daría mañana a la noche. */
export const hoyPY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });

export function fechaES(iso?: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function fechaHora(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso)
    .toLocaleString("es-PY", {
      timeZone: "America/Asuncion",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(",", "");
}

export function ModalShell({
  title,
  onClose,
  children,
  ancho = "max-w-lg",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  ancho?: string;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white shadow-lg ${ancho}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100" aria-label="Cerrar">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Aviso({ tipo = "error", children }: { tipo?: "error" | "ok" | "info"; children: React.ReactNode }) {
  const c =
    tipo === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : tipo === "ok"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-sky-200 bg-sky-50 text-sky-800";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${c}`}>{children}</div>;
}

// ── Usuarios (para elegir responsable) ───────────────────────────────────────
export interface UsuarioLista {
  id: string;
  nombre: string | null;
  email: string;
}
export const nombreDe = (u: UsuarioLista) => u.nombre?.trim() || u.email;

export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);
  useEffect(() => {
    fetchWithSupabaseSession("/api/usuarios/empresa-activos", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setUsuarios((j?.usuarios ?? []) as UsuarioLista[]))
      .catch(() => undefined);
  }, []);
  return usuarios;
}

/** Select de responsable: guarda id y nombre (el nombre queda aunque el usuario se desactive). */
export function ResponsableSelect({
  usuarios,
  id,
  nombre,
  onChange,
  disabled,
}: {
  usuarios: UsuarioLista[];
  id: string | null;
  nombre: string | null;
  onChange: (id: string | null, nombre: string | null) => void;
  disabled?: boolean;
}) {
  const conocido = !id || usuarios.some((u) => u.id === id);
  return (
    <select
      value={id ?? ""}
      disabled={disabled}
      onChange={(e) => {
        const u = usuarios.find((x) => x.id === e.target.value);
        onChange(u ? u.id : null, u ? nombreDe(u) : null);
      }}
      className={inputClass}
    >
      <option value="">— Elegir —</option>
      {!conocido && <option value={id ?? ""}>{nombre}</option>}
      {usuarios.map((u) => (
        <option key={u.id} value={u.id}>
          {nombreDe(u)}
        </option>
      ))}
    </select>
  );
}
