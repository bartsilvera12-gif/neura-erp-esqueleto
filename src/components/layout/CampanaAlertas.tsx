"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Alerta = { id: string; nivel: "alta" | "media" | "info"; texto: string; ruta: string };
const PUNTO: Record<Alerta["nivel"], string> = { alta: "bg-rose-500", media: "bg-amber-500", info: "bg-sky-500" };

/** Campanita: alertas del ERP (incidencias, cuotas vencidas, cajas chicas, atrasos). Se actualiza cada 5 minutos. */
export default function CampanaAlertas() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cargar = () =>
      fetchWithSupabaseSession("/api/alertas", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j?.data?.alertas && setAlertas(j.data.alertas as Alerta[]))
        .catch(() => undefined);
    void cargar();
    const t = setInterval(cargar, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const altas = alertas.filter((a) => a.nivel === "alta").length;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-[#3F8E91]"
        aria-label="Notificaciones"
      >
        <Bell className="h-5 w-5" />
        <span
          className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
            altas ? "bg-rose-500" : "bg-[#4FAEB2]"
          }`}
        >
          {alertas.length}
        </span>
      </button>
      {abierto && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <p className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Alertas</p>
          {alertas.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">Todo en orden. No hay alertas.</p>}
          {alertas.map((a) => (
            <Link key={a.id} href={a.ruta} onClick={() => setAbierto(false)} className="flex gap-3 border-b border-slate-50 px-4 py-3 text-sm text-slate-700 last:border-b-0 hover:bg-slate-50">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PUNTO[a.nivel]}`} />
              <span>{a.texto}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
