"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown, Lock, LockOpen, Check } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Gestion = { anio: number; estado: string };

function setGestionCookie(anio: number) {
  try { document.cookie = `neura_gestion=${anio}; path=/; max-age=${60 * 60 * 24 * 365}`; } catch { /* nop */ }
}

export default function GestionSelector() {
  const [gestiones, setGestiones] = useState<Gestion[]>([]);
  const [activa, setActiva] = useState<number>(new Date().getFullYear());
  const [puedeCerrar, setPuedeCerrar] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    const r = await fetchWithSupabaseSession("/api/gestiones", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r?.success) {
      setGestiones((r.data.gestiones as Gestion[]) ?? []);
      setActiva(Number(r.data.activa) || new Date().getFullYear());
      setPuedeCerrar(!!r.data.puede_cerrar);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function elegir(anio: number) {
    if (anio === activa) { setOpen(false); return; }
    setGestionCookie(anio);
    window.location.reload(); // recargar para que todo el sistema use la gestión nueva
  }

  async function toggleCierre(anio: number, estadoActual: string) {
    if (busy) return;
    const cerrar = estadoActual !== "cerrada";
    if (!confirm(cerrar
      ? `¿Cerrar la gestión ${anio}? Quedará en SOLO LECTURA: no se podrán crear ni modificar registros de ${anio}.`
      : `¿Reabrir la gestión ${anio}? Se podrá volver a crear y modificar registros de ${anio}.`)) return;
    setBusy(true);
    const r = await fetchWithSupabaseSession("/api/gestiones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anio, estado: cerrar ? "cerrada" : "abierta" }) }).then((x) => x.json()).catch(() => ({ success: false }));
    setBusy(false);
    if (r?.success) await cargar(); else alert(r?.error ?? "No se pudo cambiar la gestión.");
  }

  const activaEstado = gestiones.find((g) => g.anio === activa)?.estado;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="zx-surface zx-surface-interactive flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-slate-700"
        title="Gestión (año) activa"
      >
        <Calendar className="h-4 w-4 text-[#3F8E91]" />
        <span className="hidden sm:inline">Gestión</span>
        <span className="font-bold">{activa}</span>
        {activaEstado === "cerrada" && <Lock className="h-3.5 w-3.5 text-amber-600" />}
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div className="zx-surface absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden shadow-xl">
          <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Cambiar de gestión</p>
          <div className="py-1">
            {gestiones.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">Sin gestiones.</p>}
            {gestiones.map((g) => (
              <div key={g.anio} className="flex items-center justify-between px-2 py-1 hover:bg-slate-50">
                <button onClick={() => elegir(g.anio)} className="flex flex-1 items-center gap-2 px-1 py-1 text-left text-sm">
                  {g.anio === activa ? <Check className="h-4 w-4 text-[#3F8E91]" /> : <span className="w-4" />}
                  <span className={g.anio === activa ? "font-semibold" : ""}>Gestión {g.anio}</span>
                  {g.estado === "cerrada" && <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"><Lock className="h-3 w-3" /> Cerrada</span>}
                </button>
                {puedeCerrar && (
                  <button onClick={() => toggleCierre(g.anio, g.estado)} disabled={busy} title={g.estado === "cerrada" ? "Reabrir" : "Cerrar"} className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-50">
                    {g.estado === "cerrada" ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  </button>
                )}
              </div>
            ))}
          </div>
          {puedeCerrar && <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">El candado cierra/reabre una gestión. Cerrada = solo lectura.</p>}
        </div>
      )}
    </div>
  );
}
