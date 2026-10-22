"use client";

import { useCallback, useEffect, useState } from "react";
import { Boxes, History, Plus, RotateCcw, X, Search } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { TIPO_MOVIMIENTO_LABEL } from "@/lib/produccion/inventario-helper";

type Fila = { articulo_tipo: "tablero" | "herraje"; articulo_id: string; codigo: string; descripcion: string; unidad: string; stock_minimo: number | null; fisico: number; utilizable: number; reservado: number; disponible: number };
type Mov = { id: string; tipo: string; cantidad: number; delta_fisico: number; unidad: string | null; ubicacion: string | null; referencia: string | null; motivo: string | null; reverso_de: string | null; usuario_nombre: string | null; fecha: string };

const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20";
const n = (v: unknown) => Number(v) || 0;
const fFechaHora = (v: unknown) => (v ? new Date(String(v)).toLocaleString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

// Tipos que el usuario puede registrar a mano (la entrega a contratista sale de la nota de entrega, Fase 5).
const TIPOS_MANUALES = ["recepcion_compra", "devolucion_aceptada", "devolucion_danada", "ajuste_conteo"] as const;

export default function InventarioProduccionPage() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "tablero" | "herraje">("todos");
  const [movModal, setMovModal] = useState<Fila | null>(null);
  const [kardex, setKardex] = useState<{ fila: Fila; movs: Mov[] } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await fetchWithSupabaseSession("/api/produccion/inventario", { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false }));
    if (r?.success) setFilas(r.data.inventario as Fila[]); else setError(r?.error ?? "No se pudo cargar el inventario.");
    setCargando(false);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function abrirKardex(f: Fila) {
    const r = await fetchWithSupabaseSession(`/api/produccion/inventario/${f.articulo_tipo}/${f.articulo_id}/movimientos`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false }));
    if (r?.success) setKardex({ fila: f, movs: r.data.movimientos as Mov[] });
  }
  async function reversar(mov: Mov, fila: Fila) {
    const motivo = prompt("Motivo del reverso:");
    if (!motivo) return;
    const r = await fetchWithSupabaseSession("/api/produccion/inventario/movimientos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articulo_tipo: fila.articulo_tipo, articulo_id: fila.articulo_id, tipo: "reverso", reverso_de: mov.id, motivo }) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) { await abrirKardex(fila); void cargar(); } else setError(r?.error ?? "No se pudo reversar.");
  }

  const q = buscar.trim().toLowerCase();
  const visibles = filas.filter((f) => (filtroTipo === "todos" || f.articulo_tipo === filtroTipo) && (!q || f.codigo.toLowerCase().includes(q) || f.descripcion.toLowerCase().includes(q)));

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Boxes className="h-6 w-6 text-[#4FAEB2]" /> Inventario de producción</h1>
      </div>
      <p className="mb-4 text-sm text-slate-500">El stock se calcula a partir de movimientos; no se edita a mano. <b>Disponible</b> = físico utilizable − reservado.</p>
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por código o descripción" className={`${input} pl-9`} />
        </div>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as "todos" | "tablero" | "herraje")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="todos">Todos</option>
          <option value="tablero">Tableros</option>
          <option value="herraje">Herrajes</option>
        </select>
      </div>

      <div className="zx-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-400">
            <th className="px-4 py-2 font-medium">Artículo</th><th className="px-2 py-2 font-medium">Tipo</th>
            <th className="px-2 py-2 text-right font-medium">Físico</th><th className="px-2 py-2 text-right font-medium">Reservado</th>
            <th className="px-2 py-2 text-right font-medium">Disponible</th><th className="px-4 py-2 text-right font-medium">Acciones</th>
          </tr></thead>
          <tbody>
            {cargando && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Cargando…</td></tr>}
            {!cargando && visibles.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Sin artículos. Cargá tableros/herrajes en los catálogos.</td></tr>}
            {visibles.map((f) => {
              const bajo = f.stock_minimo != null && f.disponible < f.stock_minimo;
              return (
                <tr key={`${f.articulo_tipo}-${f.articulo_id}`} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2"><span className="font-mono text-xs font-semibold text-[#3F8E91]">{f.codigo}</span><div className="text-slate-700">{f.descripcion}</div></td>
                  <td className="px-2 py-2 text-xs capitalize text-slate-500">{f.articulo_tipo}</td>
                  <td className="px-2 py-2 text-right font-mono">{n(f.fisico)}</td>
                  <td className="px-2 py-2 text-right font-mono text-amber-600">{n(f.reservado) || "—"}</td>
                  <td className={`px-2 py-2 text-right font-mono font-semibold ${bajo ? "text-rose-600" : "text-slate-800"}`}>{n(f.disponible)} <span className="text-xs font-normal text-slate-400">{f.unidad}</span></td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setMovModal(f)} className="inline-flex items-center gap-1 rounded-lg bg-[#4FAEB2] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91]"><Plus className="h-3.5 w-3.5" /> Movimiento</button>
                      <button onClick={() => abrirKardex(f)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"><History className="h-3.5 w-3.5" /> Kardex</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {movModal && <ModalMovimiento fila={movModal} onClose={() => setMovModal(null)} onOk={() => { setMovModal(null); void cargar(); }} />}
      {kardex && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setKardex(null)}>
          <div className="zx-surface max-h-[85vh] w-full max-w-3xl overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><History className="h-5 w-5 text-[#4FAEB2]" /> Kardex · {kardex.fila.codigo}</h2>
              <button onClick={() => setKardex(null)} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-3 text-sm text-slate-500">Físico: <b>{n(kardex.fila.fisico)}</b> · Reservado: <b>{n(kardex.fila.reservado)}</b> · Disponible: <b>{n(kardex.fila.disponible)}</b> {kardex.fila.unidad}</p>
            {kardex.movs.length === 0 ? <p className="text-sm text-slate-400">Sin movimientos todavía.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-400"><th className="pb-1 font-medium">Fecha</th><th className="pb-1 font-medium">Movimiento</th><th className="pb-1 text-right font-medium">Cant.</th><th className="pb-1 font-medium">Ref./Motivo</th><th /></tr></thead>
                <tbody>
                  {kardex.movs.map((m) => (
                    <tr key={m.id} className="border-t border-slate-50">
                      <td className="py-1.5 text-xs text-slate-500">{fFechaHora(m.fecha)}</td>
                      <td className="py-1.5">{TIPO_MOVIMIENTO_LABEL[m.tipo] ?? m.tipo}{m.reverso_de ? <span className="ml-1 text-xs text-rose-500">(reverso)</span> : null}</td>
                      <td className={`py-1.5 text-right font-mono ${n(m.delta_fisico) < 0 ? "text-rose-600" : "text-emerald-600"}`}>{n(m.delta_fisico) > 0 ? "+" : ""}{n(m.delta_fisico)}</td>
                      <td className="py-1.5 text-xs text-slate-500">{[m.referencia, m.motivo].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="py-1.5 text-right">{!m.reverso_de && <button onClick={() => reversar(m, kardex.fila)} title="Reversar" className="text-slate-400 hover:text-rose-600"><RotateCcw className="h-3.5 w-3.5" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModalMovimiento({ fila, onClose, onOk }: { fila: Fila; onClose: () => void; onOk: () => void }) {
  const [tipo, setTipo] = useState<string>("recepcion_compra");
  const [cantidad, setCantidad] = useState("");
  const [salida, setSalida] = useState(false);
  const [ubicacion, setUbicacion] = useState("");
  const [referencia, setReferencia] = useState("");
  const [motivo, setMotivo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setErr(null); setGuardando(true);
    const body = { articulo_tipo: fila.articulo_tipo, articulo_id: fila.articulo_id, tipo, cantidad: Number(cantidad) || 0, salida: tipo === "ajuste_conteo" ? salida : false, unidad: fila.unidad, ubicacion, referencia, motivo };
    const r = await fetchWithSupabaseSession("/api/produccion/inventario/movimientos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    setGuardando(false);
    if (r?.success) onOk(); else setErr(r?.error ?? "No se pudo registrar.");
  }

  const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20";
  const esAjuste = tipo === "ajuste_conteo";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="zx-surface w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Nuevo movimiento</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-slate-500"><span className="font-mono text-xs font-semibold text-[#3F8E91]">{fila.codigo}</span> · {fila.descripcion}</p>
        {err && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <div className="space-y-3">
          <div><label className="text-xs text-slate-400">Tipo de movimiento</label><select value={tipo} onChange={(e) => setTipo(e.target.value)} className={input}>{TIPOS_MANUALES.map((t) => <option key={t} value={t}>{TIPO_MOVIMIENTO_LABEL[t]}</option>)}</select></div>
          <div className="flex gap-2">
            <div className="flex-1"><label className="text-xs text-slate-400">Cantidad</label><input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={input} /></div>
            {esAjuste && <div className="flex-1"><label className="text-xs text-slate-400">Sentido</label><select value={salida ? "salida" : "entrada"} onChange={(e) => setSalida(e.target.value === "salida")} className={input}><option value="entrada">Suma (+)</option><option value="salida">Resta (−)</option></select></div>}
          </div>
          <div><label className="text-xs text-slate-400">Ubicación</label><input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} className={input} /></div>
          <div><label className="text-xs text-slate-400">Referencia (comprobante / documento)</label><input value={referencia} onChange={(e) => setReferencia(e.target.value)} className={input} /></div>
          <div><label className="text-xs text-slate-400">Motivo {esAjuste && <span className="text-rose-500">*</span>}</label><input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={input} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50">{guardando ? "Guardando…" : "Registrar"}</button>
        </div>
      </div>
    </div>
  );
}
