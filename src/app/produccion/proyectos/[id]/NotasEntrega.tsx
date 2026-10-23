"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Check, Truck, ChevronDown, ChevronRight, Paperclip, Ban } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Nota = { id: string; numero: string; contratista_id: string | null; contratista_nombre: string | null; tipo: string; fecha: string; estado: string };
type NotaDet = Record<string, unknown> & { id: string; numero: string; tipo: string; estado: string; observaciones: string | null; motivo_anulacion: string | null; confirmada_por: string | null };
type Linea = { id: string; articulo_tipo: string; articulo_id: string; descripcion: string | null; cantidad: number; unidad: string | null; condicion: string };
type Contratista = { id: string; nombre: string };
type ArtInv = { articulo_tipo: "tablero" | "herraje"; articulo_id: string; codigo: string; descripcion: string; unidad: string; disponible: number };

const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20";
const fFecha = (v: unknown) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—");
const ESTADO = { borrador: { t: "Borrador", c: "bg-slate-100 text-slate-600" }, confirmada: { t: "Confirmada", c: "bg-emerald-50 text-emerald-700" }, anulada: { t: "Anulada", c: "bg-rose-50 text-rose-700" } } as Record<string, { t: string; c: string }>;

export default function NotasEntrega({ proyectoId }: { proyectoId: string }) {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [contratistas, setContratistas] = useState<Contratista[]>([]);
  const [articulos, setArticulos] = useState<ArtInv[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<{ nota: NotaDet; lineas: Linea[]; firma_url: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [nn, setNn] = useState({ tipo: "entrega", contratista_id: "" });
  const [nl, setNl] = useState({ articulo: "", cantidad: "1", condicion: "buena" });
  const fileRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const r = await fetchWithSupabaseSession(`/api/produccion/proyectos/${proyectoId}/notas-entrega`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false }));
    if (r?.success) setNotas(r.data.notas as Nota[]);
  }, [proyectoId]);
  useEffect(() => {
    void cargar();
    fetchWithSupabaseSession("/api/produccion/contratistas", { cache: "no-store" }).then((x) => x.json()).then((j) => { if (j?.success) setContratistas((j.data.contratistas as Record<string, unknown>[]).map((c) => ({ id: String(c.id), nombre: String(c.nombre) }))); }).catch(() => {});
    fetchWithSupabaseSession("/api/produccion/inventario", { cache: "no-store" }).then((x) => x.json()).then((j) => { if (j?.success) setArticulos(j.data.inventario as ArtInv[]); }).catch(() => {});
  }, [cargar]);

  const abrir = useCallback(async (id: string) => {
    if (abierta === id) { setAbierta(null); setDetalle(null); return; }
    const r = await fetchWithSupabaseSession(`/api/produccion/notas-entrega/${id}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false }));
    if (r?.success) { setAbierta(id); setDetalle({ nota: r.data.nota as NotaDet, lineas: r.data.detalle as Linea[], firma_url: r.data.firma_url as string | null }); }
  }, [abierta]);
  const refrescar = useCallback(async (id: string) => {
    const r = await fetchWithSupabaseSession(`/api/produccion/notas-entrega/${id}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false }));
    if (r?.success) setDetalle({ nota: r.data.nota as NotaDet, lineas: r.data.detalle as Linea[], firma_url: r.data.firma_url as string | null });
    void cargar();
  }, [cargar]);

  async function crear() {
    const r = await fetchWithSupabaseSession(`/api/produccion/proyectos/${proyectoId}/notas-entrega`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nn) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) { setNueva(false); setNn({ tipo: "entrega", contratista_id: "" }); await cargar(); void abrir(r.data.nota.id); } else setError(r?.error ?? "No se pudo crear.");
  }
  async function borrar(id: string) {
    if (!confirm("¿Borrar esta nota en borrador?")) return;
    const r = await fetchWithSupabaseSession(`/api/produccion/notas-entrega/${id}`, { method: "DELETE" }).then((x) => x.json());
    if (r?.success) { if (abierta === id) { setAbierta(null); setDetalle(null); } void cargar(); } else setError(r?.error ?? "No se pudo borrar.");
  }
  async function agregarLinea(id: string) {
    const art = articulos.find((a) => `${a.articulo_tipo}:${a.articulo_id}` === nl.articulo);
    if (!art) { setError("Elegí el artículo."); return; }
    const body = { articulo_tipo: art.articulo_tipo, articulo_id: art.articulo_id, descripcion: `${art.codigo} · ${art.descripcion}`, unidad: art.unidad, cantidad: Number(nl.cantidad) || 0, condicion: nl.condicion };
    const r = await fetchWithSupabaseSession(`/api/produccion/notas-entrega/${id}/lineas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) { setNl({ articulo: "", cantidad: "1", condicion: "buena" }); await refrescar(id); } else setError(r?.error ?? "No se pudo agregar.");
  }
  async function borrarLinea(id: string, lineaId: string) {
    const r = await fetchWithSupabaseSession(`/api/produccion/notas-entrega/${id}/lineas/${lineaId}`, { method: "DELETE" }).then((x) => x.json());
    if (r?.success) await refrescar(id); else setError(r?.error ?? "No se pudo borrar.");
  }
  async function confirmar(id: string) {
    if (!confirm("¿Confirmar la nota? Va a descontar/ingresar el stock del inventario y no se podrá editar.")) return;
    const r = await fetchWithSupabaseSession(`/api/produccion/notas-entrega/${id}/confirmar`, { method: "POST" }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) await refrescar(id); else setError(r?.error ?? "No se pudo confirmar.");
  }
  async function anular(id: string) {
    const motivo = prompt("Motivo de la anulación:");
    if (!motivo) return;
    const r = await fetchWithSupabaseSession(`/api/produccion/notas-entrega/${id}/anular`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo }) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) await refrescar(id); else setError(r?.error ?? "No se pudo anular.");
  }
  async function subirFirma(id: string, file: File) {
    const fd = new FormData(); fd.append("file", file);
    const r = await fetchWithSupabaseSession(`/api/produccion/notas-entrega/${id}/firma`, { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) await refrescar(id); else setError(r?.error ?? "No se pudo subir la firma.");
  }

  const editable = detalle?.nota.estado === "borrador";
  const n = detalle?.nota;

  return (
    <div className="zx-surface mt-4 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Truck className="h-4 w-4 text-[#4FAEB2]" /> Notas de entrega ({notas.length})</h2>
        <button onClick={() => { setNueva((v) => !v); setError(null); }} className="inline-flex items-center gap-1 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#3F8E91]"><Plus className="h-4 w-4" /> Nueva nota</button>
      </div>
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {nueva && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div className="w-40"><label className="text-[11px] text-slate-400">Tipo</label><select value={nn.tipo} onChange={(e) => setNn({ ...nn, tipo: e.target.value })} className={input}><option value="entrega">Entrega a contratista</option><option value="devolucion">Devolución</option></select></div>
          <div className="flex-1 min-w-[180px]"><label className="text-[11px] text-slate-400">Contratista</label><select value={nn.contratista_id} onChange={(e) => setNn({ ...nn, contratista_id: e.target.value })} className={input}><option value="">— Sin contratista —</option>{contratistas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
          <button onClick={crear} className="rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91]">Crear</button>
        </div>
      )}
      {notas.length === 0 && !nueva && <p className="text-xs text-slate-400">Todavía no hay notas de entrega.</p>}

      <div className="space-y-2">
        {notas.map((nt) => (
          <div key={nt.id} className="rounded-lg border border-slate-100">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <button onClick={() => abrir(nt.id)} className="flex flex-1 items-center gap-2 text-left text-sm">
                {abierta === nt.id ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                <span className="font-mono text-xs font-semibold text-[#3F8E91]">{nt.numero}</span>
                <span className="text-xs text-slate-500">{nt.tipo === "devolucion" ? "Devolución" : "Entrega"}{nt.contratista_nombre ? ` · ${nt.contratista_nombre}` : ""}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${(ESTADO[nt.estado] ?? ESTADO.borrador).c}`}>{(ESTADO[nt.estado] ?? { t: nt.estado }).t}</span>
                <span className="text-xs text-slate-400">{fFecha(nt.fecha)}</span>
              </button>
              {nt.estado === "borrador" && <button onClick={() => borrar(nt.id)} className="text-rose-500 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>}
            </div>

            {abierta === nt.id && detalle && n && (
              <div className="border-t border-slate-100 px-3 py-3">
                {n.estado === "confirmada" && n.confirmada_por && <p className="mb-2 text-xs text-emerald-700">Confirmada por {n.confirmada_por}. El stock ya se actualizó en el inventario.</p>}
                {n.estado === "anulada" && n.motivo_anulacion && <p className="mb-2 text-xs text-rose-700">Anulada: {n.motivo_anulacion}</p>}

                {detalle.lineas.length === 0 ? <p className="text-xs text-slate-400">Sin artículos todavía.</p> : (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-400"><th className="pb-1 font-medium">Artículo</th><th className="pb-1 text-right font-medium">Cant.</th><th className="pb-1 font-medium">Condición</th><th /></tr></thead>
                    <tbody>
                      {detalle.lineas.map((l) => (
                        <tr key={l.id} className="border-t border-slate-50">
                          <td className="py-1.5">{l.descripcion}</td>
                          <td className="py-1.5 text-right font-mono">{Number(l.cantidad)} <span className="text-xs text-slate-400">{l.unidad}</span></td>
                          <td className="py-1.5 text-xs text-slate-500">{l.condicion === "danada" ? "Dañada" : "Buena"}</td>
                          <td className="py-1.5 text-right">{editable && <button onClick={() => borrarLinea(n.id, l.id)} className="text-rose-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Firma */}
                <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2">
                  {detalle.firma_url ? <a href={detalle.firma_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#3F8E91] hover:underline"><Paperclip className="h-3.5 w-3.5" /> Ver firma</a> : null}
                  {n.estado !== "anulada" && <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><Paperclip className="h-3.5 w-3.5" /> {detalle.firma_url ? "Reemplazar firma" : "Adjuntar firma"}</button>}
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirFirma(n.id, f); e.target.value = ""; }} />
                </div>

                {editable && (
                  <>
                    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                      <div className="flex-1 min-w-[200px]"><label className="text-[11px] text-slate-400">Artículo</label><select value={nl.articulo} onChange={(e) => setNl({ ...nl, articulo: e.target.value })} className={input}><option value="">— Elegir —</option>{articulos.map((a) => <option key={`${a.articulo_tipo}:${a.articulo_id}`} value={`${a.articulo_tipo}:${a.articulo_id}`}>{a.codigo} · {a.descripcion} (disp. {a.disponible})</option>)}</select></div>
                      <div className="w-20"><label className="text-[11px] text-slate-400">Cant.</label><input type="number" value={nl.cantidad} onChange={(e) => setNl({ ...nl, cantidad: e.target.value })} className={input} /></div>
                      {n.tipo === "devolucion" && <div className="w-28"><label className="text-[11px] text-slate-400">Condición</label><select value={nl.condicion} onChange={(e) => setNl({ ...nl, condicion: e.target.value })} className={input}><option value="buena">Buena</option><option value="danada">Dañada</option></select></div>}
                      <button onClick={() => agregarLinea(n.id)} className="inline-flex items-center gap-1 rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91]"><Plus className="h-4 w-4" /> Artículo</button>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button onClick={() => confirmar(n.id)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Check className="h-4 w-4" /> Confirmar nota</button>
                    </div>
                  </>
                )}
                {n.estado === "confirmada" && (
                  <div className="mt-3 flex justify-end">
                    <button onClick={() => anular(n.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"><Ban className="h-4 w-4" /> Anular nota</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
