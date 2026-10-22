"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Check, FileText, ChevronDown, ChevronRight } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Version = { id: string; version: number; estado: string; fecha: string; total: number; aprobado_por: string | null; aprobado_at: string | null };
type Linea = { id: string; tipo_costo: string; descripcion: string; unidad: string | null; cantidad: number; costo_unitario: number; subtotal: number; observaciones: string | null };

const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20";
const gs = (n: unknown) => "₲ " + Math.round(Number(n) || 0).toLocaleString("es-PY");
const TIPO_LABEL: Record<string, string> = { tablero: "Tablero", herraje: "Herraje", contratista: "Contratista", otro: "Otro" };
const ESTADO_LABEL: Record<string, string> = { borrador: "Borrador", en_revision: "En revisión", aprobada: "Aprobada", rechazada: "Rechazada" };

export default function PresupuestosProyecto({ proyectoId }: { proyectoId: string }) {
  const [versiones, setVersiones] = useState<Version[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [estadoAbierto, setEstadoAbierto] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [nd, setNd] = useState({ tipo_costo: "tablero", descripcion: "", unidad: "", cantidad: "1", costo_unitario: "" });

  const cargarVersiones = useCallback(async () => {
    const r = await fetchWithSupabaseSession(`/api/produccion/proyectos/${proyectoId}/presupuestos`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false }));
    if (r?.success) setVersiones(r.data.presupuestos as Version[]);
  }, [proyectoId]);
  useEffect(() => { void cargarVersiones(); }, [cargarVersiones]);

  const abrir = useCallback(async (presId: string) => {
    if (abierto === presId) { setAbierto(null); return; }
    const r = await fetchWithSupabaseSession(`/api/produccion/presupuestos/${presId}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false }));
    if (r?.success) { setAbierto(presId); setLineas(r.data.lineas as Linea[]); setEstadoAbierto((r.data.presupuesto as Version).estado); }
  }, [abierto]);

  async function nuevaVersion() {
    const r = await fetchWithSupabaseSession(`/api/produccion/proyectos/${proyectoId}/presupuestos`, { method: "POST" }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) { await cargarVersiones(); void abrir(r.data.presupuesto.id); } else setError(r?.error ?? "No se pudo crear.");
  }
  async function borrarVersion(presId: string) {
    if (!confirm("¿Borrar esta versión en borrador?")) return;
    const r = await fetchWithSupabaseSession(`/api/produccion/presupuestos/${presId}`, { method: "DELETE" }).then((x) => x.json());
    if (r?.success) { if (abierto === presId) setAbierto(null); void cargarVersiones(); } else setError(r?.error ?? "No se pudo borrar.");
  }
  async function agregarLinea(presId: string) {
    if (!nd.descripcion.trim()) return;
    const r = await fetchWithSupabaseSession(`/api/produccion/presupuestos/${presId}/lineas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...nd, cantidad: Number(nd.cantidad) || 0, costo_unitario: Number(nd.costo_unitario) || 0 }) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) { setNd({ tipo_costo: "tablero", descripcion: "", unidad: "", cantidad: "1", costo_unitario: "" }); await abrirRefrescar(presId); } else setError(r?.error ?? "No se pudo agregar.");
  }
  async function borrarLinea(presId: string, lineaId: string) {
    const r = await fetchWithSupabaseSession(`/api/produccion/presupuestos/${presId}/lineas/${lineaId}`, { method: "DELETE" }).then((x) => x.json());
    if (r?.success) await abrirRefrescar(presId); else setError(r?.error ?? "No se pudo borrar.");
  }
  async function aprobar(presId: string) {
    if (!confirm("¿Aprobar este presupuesto? Una vez aprobado no se edita (para cambios se crea una nueva versión).")) return;
    const r = await fetchWithSupabaseSession(`/api/produccion/presupuestos/${presId}/aprobar`, { method: "POST" }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) { await cargarVersiones(); await abrirRefrescar(presId); } else setError(r?.error ?? "No se pudo aprobar.");
  }
  // Refresca líneas + versiones (total/estado pueden haber cambiado) manteniendo el panel abierto.
  async function abrirRefrescar(presId: string) {
    const r = await fetchWithSupabaseSession(`/api/produccion/presupuestos/${presId}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false }));
    if (r?.success) { setLineas(r.data.lineas as Linea[]); setEstadoAbierto((r.data.presupuesto as Version).estado); }
    void cargarVersiones();
  }

  const editable = estadoAbierto === "borrador";
  const totalAbierto = lineas.reduce((a, l) => a + (Number(l.subtotal) || 0), 0);

  return (
    <div className="zx-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><FileText className="h-4 w-4 text-[#4FAEB2]" /> Presupuestos ({versiones.length})</h2>
        <button onClick={nuevaVersion} className="inline-flex items-center gap-1 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#3F8E91]"><Plus className="h-4 w-4" /> Nueva versión</button>
      </div>
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {versiones.length === 0 && <p className="text-xs text-slate-400">Todavía no hay presupuestos. Creá una versión para empezar a cargar costos.</p>}

      <div className="space-y-2">
        {versiones.map((v) => (
          <div key={v.id} className="rounded-lg border border-slate-100">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <button onClick={() => abrir(v.id)} className="flex flex-1 items-center gap-2 text-left text-sm">
                {abierto === v.id ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                <span className="font-semibold">Versión {v.version}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${v.estado === "aprobada" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{ESTADO_LABEL[v.estado] ?? v.estado}</span>
                <span className="ml-auto font-mono text-sm font-semibold text-slate-700">{gs(v.total)}</span>
              </button>
              {v.estado === "borrador" && <button onClick={() => borrarVersion(v.id)} className="text-rose-500 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>}
            </div>

            {abierto === v.id && (
              <div className="border-t border-slate-100 px-3 py-3">
                {v.estado === "aprobada" && v.aprobado_por && <p className="mb-2 text-xs text-emerald-700">Aprobado por {v.aprobado_por}{v.aprobado_at ? ` el ${String(v.aprobado_at).slice(0, 10).split("-").reverse().join("/")}` : ""}.</p>}
                {lineas.length === 0 ? <p className="text-xs text-slate-400">Sin líneas todavía.</p> : (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-400"><th className="pb-1 font-medium">Tipo</th><th className="pb-1 font-medium">Descripción</th><th className="pb-1 text-right font-medium">Cant.</th><th className="pb-1 text-right font-medium">Costo unit.</th><th className="pb-1 text-right font-medium">Subtotal</th><th /></tr></thead>
                    <tbody>
                      {lineas.map((l) => (
                        <tr key={l.id} className="border-t border-slate-50">
                          <td className="py-1.5 text-xs text-slate-500">{TIPO_LABEL[l.tipo_costo] ?? l.tipo_costo}</td>
                          <td className="py-1.5">{l.descripcion}{l.unidad ? <span className="text-xs text-slate-400"> · {l.unidad}</span> : null}</td>
                          <td className="py-1.5 text-right">{Number(l.cantidad)}</td>
                          <td className="py-1.5 text-right font-mono">{gs(l.costo_unitario)}</td>
                          <td className="py-1.5 text-right font-mono font-semibold">{gs(l.subtotal)}</td>
                          <td className="py-1.5 text-right">{editable && <button onClick={() => borrarLinea(v.id, l.id)} className="text-rose-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-slate-200 font-semibold"><td colSpan={4} className="py-2 text-right">Total</td><td className="py-2 text-right font-mono">{gs(totalAbierto)}</td><td /></tr>
                    </tbody>
                  </table>
                )}

                {editable && (
                  <>
                    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                      <div className="w-28"><label className="text-[11px] text-slate-400">Tipo</label><select value={nd.tipo_costo} onChange={(e) => setNd({ ...nd, tipo_costo: e.target.value })} className={input}>{Object.entries(TIPO_LABEL).map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}</select></div>
                      <div className="flex-1 min-w-[140px]"><label className="text-[11px] text-slate-400">Descripción</label><input value={nd.descripcion} onChange={(e) => setNd({ ...nd, descripcion: e.target.value })} className={input} /></div>
                      <div className="w-20"><label className="text-[11px] text-slate-400">Unidad</label><input value={nd.unidad} onChange={(e) => setNd({ ...nd, unidad: e.target.value })} className={input} /></div>
                      <div className="w-20"><label className="text-[11px] text-slate-400">Cant.</label><input type="number" value={nd.cantidad} onChange={(e) => setNd({ ...nd, cantidad: e.target.value })} className={input} /></div>
                      <div className="w-28"><label className="text-[11px] text-slate-400">Costo unit.</label><input type="number" value={nd.costo_unitario} onChange={(e) => setNd({ ...nd, costo_unitario: e.target.value })} className={input} /></div>
                      <button onClick={() => agregarLinea(v.id)} className="inline-flex items-center gap-1 rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91]"><Plus className="h-4 w-4" /> Línea</button>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button onClick={() => aprobar(v.id)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Check className="h-4 w-4" /> Aprobar presupuesto</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
