"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Receipt, AlertTriangle } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { CATEGORIAS_GASTO, CATEGORIA_GASTO_LABEL } from "@/lib/produccion/gastos-helper";

type Gasto = { id: string; categoria: string; proveedor_nombre: string | null; concepto: string; fecha: string; monto: number; tiene_comprobante: boolean; comprobante_numero: string | null };

const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20";
const gs = (n: unknown) => "₲ " + Math.round(Number(n) || 0).toLocaleString("es-PY");
const fFecha = (v: unknown) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—");

export default function GastosProyecto({ proyectoId }: { proyectoId: string }) {
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ categoria: "material", proveedor_nombre: "", concepto: "", fecha: new Date().toISOString().slice(0, 10), monto: "", comprobante_numero: "" });

  const cargar = useCallback(async () => {
    const r = await fetchWithSupabaseSession(`/api/produccion/gastos?proyecto_id=${proyectoId}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false }));
    if (r?.success) setGastos(r.data.gastos as Gasto[]);
  }, [proyectoId]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function crear(confirmarDup = false) {
    if (!f.concepto.trim()) { setError("Poné el concepto."); return; }
    const body = { ...f, proyecto_id: proyectoId, monto: Number(f.monto) || 0, confirmar_duplicado: confirmarDup };
    const r = await fetchWithSupabaseSession("/api/produccion/gastos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) { setNuevo(false); setF({ categoria: "material", proveedor_nombre: "", concepto: "", fecha: new Date().toISOString().slice(0, 10), monto: "", comprobante_numero: "" }); setError(null); void cargar(); }
    else if (/número de comprobante/i.test(r?.error ?? "") && !confirmarDup) { if (confirm(r.error + "\n\n¿Registrar igual?")) void crear(true); }
    else setError(r?.error ?? "No se pudo registrar.");
  }
  async function borrar(id: string) {
    if (!confirm("¿Borrar este gasto?")) return;
    const r = await fetchWithSupabaseSession(`/api/produccion/gastos/${id}`, { method: "DELETE" }).then((x) => x.json());
    if (r?.success) void cargar(); else setError(r?.error ?? "No se pudo borrar.");
  }

  const total = gastos.reduce((a, g) => a + (Number(g.monto) || 0), 0);
  const sinComprobante = gastos.filter((g) => !g.tiene_comprobante).length;

  return (
    <div className="zx-surface mt-4 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Receipt className="h-4 w-4 text-[#4FAEB2]" /> Gastos / compras del proyecto ({gastos.length})</h2>
        <button onClick={() => { setNuevo((v) => !v); setError(null); }} className="inline-flex items-center gap-1 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#3F8E91]"><Plus className="h-4 w-4" /> Nuevo gasto</button>
      </div>
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {sinComprobante > 0 && <p className="mb-3 flex items-center gap-1 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> {sinComprobante} gasto(s) sin comprobante.</p>}

      {nuevo && (
        <div className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-3">
          <div><label className="text-[11px] text-slate-400">Categoría</label><select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} className={input}>{CATEGORIAS_GASTO.map((c) => <option key={c} value={c}>{CATEGORIA_GASTO_LABEL[c]}</option>)}</select></div>
          <div className="sm:col-span-2"><label className="text-[11px] text-slate-400">Concepto</label><input value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} className={input} /></div>
          <div><label className="text-[11px] text-slate-400">Proveedor</label><input value={f.proveedor_nombre} onChange={(e) => setF({ ...f, proveedor_nombre: e.target.value })} className={input} /></div>
          <div><label className="text-[11px] text-slate-400">Fecha</label><input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} className={input} /></div>
          <div><label className="text-[11px] text-slate-400">Monto (Gs.)</label><input type="number" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} className={input} /></div>
          <div><label className="text-[11px] text-slate-400">N° comprobante</label><input value={f.comprobante_numero} onChange={(e) => setF({ ...f, comprobante_numero: e.target.value })} placeholder="(opcional)" className={input} /></div>
          <div className="flex items-end"><button onClick={() => crear(false)} className="w-full rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91]">Registrar</button></div>
        </div>
      )}
      {gastos.length === 0 && !nuevo && <p className="text-xs text-slate-400">Todavía no hay gastos cargados.</p>}

      {gastos.length > 0 && (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-400"><th className="pb-1 font-medium">Fecha</th><th className="pb-1 font-medium">Categoría</th><th className="pb-1 font-medium">Concepto</th><th className="pb-1 font-medium">Proveedor</th><th className="pb-1 text-right font-medium">Monto</th><th /></tr></thead>
          <tbody>
            {gastos.map((g) => (
              <tr key={g.id} className="border-t border-slate-50">
                <td className="py-1.5 text-xs text-slate-500">{fFecha(g.fecha)}</td>
                <td className="py-1.5 text-xs text-slate-500">{CATEGORIA_GASTO_LABEL[g.categoria] ?? g.categoria}</td>
                <td className="py-1.5">{g.concepto}{!g.tiene_comprobante ? <span className="ml-1 text-[11px] text-amber-600">(sin comprob.)</span> : null}</td>
                <td className="py-1.5 text-slate-600">{g.proveedor_nombre ?? "—"}</td>
                <td className="py-1.5 text-right font-mono font-semibold">{gs(g.monto)}</td>
                <td className="py-1.5 text-right"><button onClick={() => borrar(g.id)} className="text-rose-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 font-semibold"><td colSpan={4} className="py-2 text-right">Total gastos</td><td className="py-2 text-right font-mono">{gs(total)}</td><td /></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
