"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, ClipboardList } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Material = { id: string; articulo_tipo: string; articulo_id: string; descripcion: string | null; unidad: string | null; cantidad_requerida: number };
type Conc = { id: string; articulo_tipo: string; descripcion: string; unidad: string; requerido: number; reservado: number; entregado: number; devuelto: number; consumido: number; pendiente: number };
type ArtInv = { articulo_tipo: "tablero" | "herraje"; articulo_id: string; codigo: string; descripcion: string; unidad: string };

const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20";

export default function MaterialesProyecto({ proyectoId }: { proyectoId: string }) {
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [conc, setConc] = useState<Conc[]>([]);
  const [articulos, setArticulos] = useState<ArtInv[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nm, setNm] = useState({ articulo: "", cantidad_requerida: "1" });

  const cargar = useCallback(async () => {
    const [m, c] = await Promise.all([
      fetchWithSupabaseSession(`/api/produccion/proyectos/${proyectoId}/materiales`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false })),
      fetchWithSupabaseSession(`/api/produccion/proyectos/${proyectoId}/conciliacion`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false })),
    ]);
    if (m?.success) setMateriales(m.data.materiales as Material[]);
    if (c?.success) setConc(c.data.conciliacion as Conc[]);
  }, [proyectoId]);
  useEffect(() => {
    void cargar();
    fetchWithSupabaseSession("/api/produccion/inventario", { cache: "no-store" }).then((x) => x.json()).then((j) => { if (j?.success) setArticulos(j.data.inventario as ArtInv[]); }).catch(() => {});
  }, [cargar]);

  async function agregar() {
    const art = articulos.find((a) => `${a.articulo_tipo}:${a.articulo_id}` === nm.articulo);
    if (!art) { setError("Elegí un artículo del catálogo."); return; }
    const body = { articulo_tipo: art.articulo_tipo, articulo_id: art.articulo_id, descripcion: `${art.codigo} · ${art.descripcion}`, unidad: art.unidad, cantidad_requerida: Number(nm.cantidad_requerida) || 0 };
    const r = await fetchWithSupabaseSession(`/api/produccion/proyectos/${proyectoId}/materiales`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) { setNm({ articulo: "", cantidad_requerida: "1" }); setError(null); void cargar(); } else setError(r?.error ?? "No se pudo agregar.");
  }
  async function editarCant(id: string, cantidad: number) {
    const r = await fetchWithSupabaseSession(`/api/produccion/proyectos/${proyectoId}/materiales/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cantidad_requerida: cantidad }) }).then((x) => x.json()).catch(() => ({ success: false }));
    if (r?.success) void cargar();
  }
  async function borrar(id: string) {
    const r = await fetchWithSupabaseSession(`/api/produccion/proyectos/${proyectoId}/materiales/${id}`, { method: "DELETE" }).then((x) => x.json());
    if (r?.success) void cargar(); else setError(r?.error ?? "No se pudo borrar.");
  }

  const concById = new Map(conc.map((c) => [c.id, c]));

  return (
    <div className="zx-surface mt-4 p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700"><ClipboardList className="h-4 w-4 text-[#4FAEB2]" /> Materiales del proyecto · conciliación ({materiales.length})</h2>
      <p className="mb-3 text-xs text-slate-500">Jalá del catálogo los tableros/herrajes que lleva la obra y poné la cantidad requerida. El sistema compara con lo reservado, entregado, devuelto y consumido.</p>
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {materiales.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="px-2 py-1.5 font-medium">Artículo</th>
              <th className="px-2 py-1.5 text-right font-medium">Requerido</th><th className="px-2 py-1.5 text-right font-medium">Reservado</th>
              <th className="px-2 py-1.5 text-right font-medium">Entregado</th><th className="px-2 py-1.5 text-right font-medium">Devuelto</th>
              <th className="px-2 py-1.5 text-right font-medium">Consumido</th><th className="px-2 py-1.5 text-right font-medium">Pendiente</th><th />
            </tr></thead>
            <tbody>
              {materiales.map((m) => {
                const c = concById.get(m.id);
                const pend = c?.pendiente ?? m.cantidad_requerida;
                return (
                  <tr key={m.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-2 py-1.5">{m.descripcion}<span className="ml-1 text-[11px] text-slate-400">{m.unidad}</span></td>
                    <td className="px-2 py-1.5 text-right"><input type="number" defaultValue={Number(m.cantidad_requerida)} onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== Number(m.cantidad_requerida)) void editarCant(m.id, v); }} className="w-16 rounded border border-slate-200 px-2 py-1 text-right text-sm" /></td>
                    <td className="px-2 py-1.5 text-right font-mono text-amber-600">{c?.reservado ?? 0}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{c?.entregado ?? 0}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{c?.devuelto ?? 0}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold">{c?.consumido ?? 0}</td>
                    <td className={`px-2 py-1.5 text-right font-mono font-semibold ${pend > 0 ? "text-rose-600" : "text-emerald-700"}`}>{pend}</td>
                    <td className="px-2 py-1.5 text-right"><button onClick={() => borrar(m.id)} className="text-rose-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {materiales.length === 0 && <p className="text-xs text-slate-400">Todavía no cargaste materiales.</p>}

      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
        <div className="flex-1 min-w-[220px]"><label className="text-[11px] text-slate-400">Artículo del catálogo</label><select value={nm.articulo} onChange={(e) => setNm({ ...nm, articulo: e.target.value })} className={input}><option value="">— Elegir —</option>{articulos.map((a) => <option key={`${a.articulo_tipo}:${a.articulo_id}`} value={`${a.articulo_tipo}:${a.articulo_id}`}>{a.codigo} · {a.descripcion}</option>)}</select></div>
        <div className="w-24"><label className="text-[11px] text-slate-400">Cant. requerida</label><input type="number" value={nm.cantidad_requerida} onChange={(e) => setNm({ ...nm, cantidad_requerida: e.target.value })} className={input} /></div>
        <button onClick={agregar} className="inline-flex items-center gap-1 rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91]"><Plus className="h-4 w-4" /> Agregar</button>
      </div>
    </div>
  );
}
