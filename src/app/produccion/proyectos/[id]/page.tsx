"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Loader2, Package } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { ESTADOS_PROYECTO, ESTADO_PROYECTO_LABEL } from "@/lib/produccion/estados";
import MaterialesProyecto from "./MaterialesProyecto";
import PresupuestosProyecto from "./PresupuestosProyecto";
import OrdenesContratista from "./OrdenesContratista";
import NotasEntrega from "./NotasEntrega";
import GastosProyecto from "./GastosProyecto";
import RentabilidadProyecto from "./RentabilidadProyecto";
import CierreProyecto from "./CierreProyecto";

type Proyecto = Record<string, unknown> & { id: string; codigo: string; nombre: string; estado: string; prioridad: string };
type Mueble = { id: string; codigo: string | null; descripcion: string; cantidad: number; estado: string; observaciones: string | null };

const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20";
const fFecha = (v: unknown) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—");
const s = (v: unknown) => (v ? String(v) : "—");

export default function ProyectoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [proy, setProy] = useState<Proyecto | null>(null);
  const [muebles, setMuebles] = useState<Mueble[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDesc, setAddDesc] = useState("");
  const [addCant, setAddCant] = useState("1");
  const [addCod, setAddCod] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await fetchWithSupabaseSession(`/api/produccion/proyectos/${id}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false }));
    if (r?.success) { setProy(r.data.proyecto as Proyecto); setMuebles(r.data.muebles as Mueble[]); } else setError(r?.error ?? "No se encontró el proyecto.");
    setCargando(false);
  }, [id]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function cambiarEstado(estado: string, motivo?: string) {
    const r = await fetchWithSupabaseSession(`/api/produccion/proyectos/${id}/estado`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado, motivo }) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) void cargar(); else setError(r?.error ?? "No se pudo cambiar el estado.");
  }
  async function agregarMueble() {
    if (!addDesc.trim()) return;
    const r = await fetchWithSupabaseSession(`/api/produccion/proyectos/${id}/muebles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ descripcion: addDesc, cantidad: Number(addCant) || 1, codigo: addCod }) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) { setAddDesc(""); setAddCant("1"); setAddCod(""); void cargar(); } else setError(r?.error ?? "No se pudo agregar.");
  }
  async function borrarMueble(mid: string) {
    const r = await fetchWithSupabaseSession(`/api/produccion/proyectos/${id}/muebles/${mid}`, { method: "DELETE" }).then((x) => x.json());
    if (r?.success) void cargar(); else setError(r?.error ?? "No se pudo borrar.");
  }

  if (cargando) return <p className="p-6 text-sm text-slate-500">Cargando…</p>;
  if (!proy) return <p className="p-6 text-sm text-red-600">{error ?? "No encontrado."}</p>;

  const i = ESTADOS_PROYECTO.indexOf(proy.estado as (typeof ESTADOS_PROYECTO)[number]);
  // El paso a "cerrado" se hace desde el panel de cierre (con inspección y validaciones), no desde el botón genérico.
  const siguienteRaw = i >= 0 && i < ESTADOS_PROYECTO.length - 1 ? ESTADOS_PROYECTO[i + 1] : null;
  const siguiente = siguienteRaw === "cerrado" ? null : siguienteRaw;
  const anterior = i > 0 ? ESTADOS_PROYECTO[i - 1] : null;
  const cerrado = proy.estado === "cerrado" || proy.estado === "cancelado";

  return (
    <div className="p-4 sm:p-6">
      <Link href="/produccion/proyectos" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"><ArrowLeft className="h-3.5 w-3.5" /> Proyectos de producción</Link>
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="zx-surface mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-semibold text-[#3F8E91]">{proy.codigo}</p>
            <h1 className="text-2xl font-bold text-slate-900">{proy.nombre}</h1>
            <p className="mt-1 text-sm text-slate-500">Estado: <b>{ESTADO_PROYECTO_LABEL[proy.estado] ?? proy.estado}</b> · Prioridad: <b className="capitalize">{proy.prioridad}</b></p>
          </div>
          <div className="flex flex-wrap gap-2">
            {anterior && <button onClick={() => cambiarEstado(anterior)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">← {ESTADO_PROYECTO_LABEL[anterior]}</button>}
            {siguiente && <button onClick={() => cambiarEstado(siguiente)} className="rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91]">Pasar a {ESTADO_PROYECTO_LABEL[siguiente]} →</button>}
            {!cerrado && <button onClick={() => { const m = prompt("Motivo de cancelación (opcional):") ?? undefined; cambiarEstado("cancelado", m); }} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">Cancelar</button>}
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="zx-surface p-5 text-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Datos del proyecto</h2>
          <dl className="space-y-1.5 text-slate-600">
            <div className="flex justify-between"><dt className="text-slate-400">Cliente</dt><dd>{s(proy.cliente_nombre)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Ubicación</dt><dd>{s(proy.ubicacion)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Fecha de pedido</dt><dd>{fFecha(proy.fecha_pedido)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Entrega prevista</dt><dd>{fFecha(proy.fecha_entrega_prevista)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Resp. diseño</dt><dd>{s(proy.responsable_diseno)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Resp. producción</dt><dd>{s(proy.responsable_produccion)}</dd></div>
          </dl>
          {proy.observaciones ? <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">{String(proy.observaciones)}</p> : null}
        </div>

        <div className="zx-surface p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><Package className="h-4 w-4 text-[#4FAEB2]" /> Muebles / partidas ({muebles.length})</h2>
          <div className="space-y-2">
            {muebles.length === 0 && <p className="text-xs text-slate-400">Todavía no hay muebles cargados.</p>}
            {muebles.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{m.descripcion}</span>
                  <span className="ml-2 text-xs text-slate-400">{m.codigo ? `(${m.codigo}) · ` : ""}Cant: {Number(m.cantidad)}</span>
                </div>
                <button onClick={() => borrarMueble(m.id)} className="text-rose-500 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          {!cerrado && (
            <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
              <div className="flex-1 min-w-[140px]"><input value={addDesc} onChange={(e) => setAddDesc(e.target.value)} placeholder="Descripción del mueble" className={input} /></div>
              <div className="w-20"><input value={addCod} onChange={(e) => setAddCod(e.target.value)} placeholder="Código" className={input} /></div>
              <div className="w-16"><input type="number" value={addCant} onChange={(e) => setAddCant(e.target.value)} placeholder="Cant" className={input} /></div>
              <button onClick={agregarMueble} className="inline-flex items-center gap-1 rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91]"><Plus className="h-4 w-4" /> Agregar</button>
            </div>
          )}
        </div>
      </div>

      <MaterialesProyecto proyectoId={proy.id} />
      <PresupuestosProyecto proyectoId={proy.id} />
      <OrdenesContratista proyectoId={proy.id} />
      <NotasEntrega proyectoId={proy.id} />
      <GastosProyecto proyectoId={proy.id} />
      <RentabilidadProyecto proyectoId={proy.id} />
      <CierreProyecto proyectoId={proy.id} onCambio={cargar} />
    </div>
  );
}
