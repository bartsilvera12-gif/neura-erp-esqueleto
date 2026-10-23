"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Check, Hammer, ChevronDown, ChevronRight, Paperclip } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { MODALIDAD_LABEL, MODALIDADES, TIPO_PARTIDA_LABEL, TIPOS_PARTIDA, CAUSA_ADICIONAL_LABEL, CAUSAS_ADICIONAL } from "@/lib/produccion/ordenes-helper";

type Orden = { id: string; contratista_id: string; contratista_nombre: string; version: number; modalidad: string; estado: string; importe_solicitado: number; importe_aprobado: number; aprobado_por: string | null; aprobado_at: string | null };
type Detalle = Record<string, unknown> & { id: string; modalidad: string; estado: string; importe_base: number; importe_solicitado: number; importe_anterior: number | null; alcance: string | null; plazo: string | null; condiciones: string | null; exclusiones: string | null };
type Linea = { id: string; tipo_partida: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number; causa: string | null };
type Contratista = { id: string; nombre: string };

const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20";
const gs = (n: unknown) => "₲ " + Math.round(Number(n) || 0).toLocaleString("es-PY");
const ESTADO_LABEL: Record<string, string> = { borrador: "Borrador", aprobada: "Aprobada", rechazada: "Rechazada" };

export default function OrdenesContratista({ proyectoId }: { proyectoId: string }) {
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [contratistas, setContratistas] = useState<Contratista[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<{ orden: Detalle; lineas: Linea[]; archivo_url: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [nc, setNc] = useState({ contratista_id: "", modalidad: "global" });
  const [nl, setNl] = useState({ tipo_partida: "unidad", descripcion: "", cantidad: "1", precio_unitario: "", causa: "ampliacion" });
  const fileRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const r = await fetchWithSupabaseSession(`/api/produccion/proyectos/${proyectoId}/ordenes`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false }));
    if (r?.success) setOrdenes(r.data.ordenes as Orden[]);
  }, [proyectoId]);
  useEffect(() => {
    void cargar();
    fetchWithSupabaseSession("/api/produccion/contratistas", { cache: "no-store" }).then((x) => x.json()).then((j) => { if (j?.success) setContratistas((j.data.contratistas as Record<string, unknown>[]).map((c) => ({ id: String(c.id), nombre: String(c.nombre) }))); }).catch(() => {});
  }, [cargar]);

  const abrir = useCallback(async (id: string) => {
    if (abierta === id) { setAbierta(null); setDetalle(null); return; }
    const r = await fetchWithSupabaseSession(`/api/produccion/ordenes/${id}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false }));
    if (r?.success) { setAbierta(id); setDetalle({ orden: r.data.orden as Detalle, lineas: r.data.lineas as Linea[], archivo_url: r.data.archivo_url as string | null }); }
  }, [abierta]);
  const refrescar = useCallback(async (id: string) => {
    const r = await fetchWithSupabaseSession(`/api/produccion/ordenes/${id}`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({ success: false }));
    if (r?.success) setDetalle({ orden: r.data.orden as Detalle, lineas: r.data.lineas as Linea[], archivo_url: r.data.archivo_url as string | null });
    void cargar();
  }, [cargar]);

  async function crear() {
    if (!nc.contratista_id) { setError("Elegí el contratista."); return; }
    const r = await fetchWithSupabaseSession(`/api/produccion/proyectos/${proyectoId}/ordenes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nc) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) { setNueva(false); setNc({ contratista_id: "", modalidad: "global" }); await cargar(); void abrir(r.data.orden.id); } else setError(r?.error ?? "No se pudo crear.");
  }
  async function borrar(id: string) {
    if (!confirm("¿Borrar esta versión en borrador?")) return;
    const r = await fetchWithSupabaseSession(`/api/produccion/ordenes/${id}`, { method: "DELETE" }).then((x) => x.json());
    if (r?.success) { if (abierta === id) { setAbierta(null); setDetalle(null); } void cargar(); } else setError(r?.error ?? "No se pudo borrar.");
  }
  async function guardarCabecera() {
    if (!detalle) return;
    const o = detalle.orden;
    const r = await fetchWithSupabaseSession(`/api/produccion/ordenes/${o.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modalidad: o.modalidad, importe_base: Number(o.importe_base) || 0, alcance: o.alcance, plazo: o.plazo, condiciones: o.condiciones, exclusiones: o.exclusiones }) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) await refrescar(o.id); else setError(r?.error ?? "No se pudo guardar.");
  }
  async function agregarLinea(id: string) {
    if (!nl.descripcion.trim()) return;
    const body = { ...nl, cantidad: Number(nl.cantidad) || 0, precio_unitario: Number(nl.precio_unitario) || 0, causa: nl.tipo_partida === "adicional" ? nl.causa : undefined };
    const r = await fetchWithSupabaseSession(`/api/produccion/ordenes/${id}/lineas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) { setNl({ tipo_partida: "unidad", descripcion: "", cantidad: "1", precio_unitario: "", causa: "ampliacion" }); await refrescar(id); } else setError(r?.error ?? "No se pudo agregar.");
  }
  async function borrarLinea(id: string, lineaId: string) {
    const r = await fetchWithSupabaseSession(`/api/produccion/ordenes/${id}/lineas/${lineaId}`, { method: "DELETE" }).then((x) => x.json());
    if (r?.success) await refrescar(id); else setError(r?.error ?? "No se pudo borrar.");
  }
  async function aprobar(id: string) {
    if (!confirm("¿Aprobar esta cotización? Una vez aprobada no se edita (para cambios creá una nueva versión).")) return;
    const r = await fetchWithSupabaseSession(`/api/produccion/ordenes/${id}/aprobar`, { method: "POST" }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) await refrescar(id); else setError(r?.error ?? "No se pudo aprobar.");
  }
  async function subirArchivo(id: string, file: File) {
    const fd = new FormData(); fd.append("file", file);
    const r = await fetchWithSupabaseSession(`/api/produccion/ordenes/${id}/archivo`, { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ success: false, error: "Error de red." }));
    if (r?.success) await refrescar(id); else setError(r?.error ?? "No se pudo subir el archivo.");
  }

  const editable = detalle?.orden.estado === "borrador";
  const o = detalle?.orden;

  return (
    <div className="zx-surface mt-4 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Hammer className="h-4 w-4 text-[#4FAEB2]" /> Órdenes de trabajo / contratistas ({ordenes.length})</h2>
        <button onClick={() => { setNueva((v) => !v); setError(null); }} className="inline-flex items-center gap-1 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#3F8E91]"><Plus className="h-4 w-4" /> Nueva cotización</button>
      </div>
      {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {nueva && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div className="flex-1 min-w-[180px]"><label className="text-[11px] text-slate-400">Contratista</label><select value={nc.contratista_id} onChange={(e) => setNc({ ...nc, contratista_id: e.target.value })} className={input}><option value="">— Elegir —</option>{contratistas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
          <div className="w-44"><label className="text-[11px] text-slate-400">Modalidad</label><select value={nc.modalidad} onChange={(e) => setNc({ ...nc, modalidad: e.target.value })} className={input}>{MODALIDADES.map((m) => <option key={m} value={m}>{MODALIDAD_LABEL[m]}</option>)}</select></div>
          <button onClick={crear} className="rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91]">Crear</button>
        </div>
      )}
      {ordenes.length === 0 && !nueva && <p className="text-xs text-slate-400">Todavía no hay cotizaciones de contratistas.</p>}

      <div className="space-y-2">
        {ordenes.map((od) => (
          <div key={od.id} className="rounded-lg border border-slate-100">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <button onClick={() => abrir(od.id)} className="flex flex-1 items-center gap-2 text-left text-sm">
                {abierta === od.id ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                <span className="font-semibold">{od.contratista_nombre}</span>
                <span className="text-xs text-slate-400">v{od.version} · {MODALIDAD_LABEL[od.modalidad]}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${od.estado === "aprobada" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{ESTADO_LABEL[od.estado] ?? od.estado}</span>
                <span className="ml-auto font-mono text-sm font-semibold text-slate-700">{gs(od.estado === "aprobada" ? od.importe_aprobado : od.importe_solicitado)}</span>
              </button>
              {od.estado === "borrador" && <button onClick={() => borrar(od.id)} className="text-rose-500 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>}
            </div>

            {abierta === od.id && detalle && o && (
              <div className="border-t border-slate-100 px-3 py-3">
                {o.importe_anterior != null && <p className="mb-2 text-xs text-slate-500">Versión anterior aprobada: {gs(o.importe_anterior)}</p>}
                {o.estado === "aprobada" && od.aprobado_por && <p className="mb-2 text-xs text-emerald-700">Aprobada por {od.aprobado_por}{od.aprobado_at ? ` el ${String(od.aprobado_at).slice(0, 10).split("-").reverse().join("/")}` : ""}.</p>}

                {/* Cabecera (editable en borrador) */}
                {editable ? (
                  <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div><label className="text-[11px] text-slate-400">Modalidad</label><select value={o.modalidad} onChange={(e) => setDetalle({ ...detalle, orden: { ...o, modalidad: e.target.value } })} className={input}>{MODALIDADES.map((m) => <option key={m} value={m}>{MODALIDAD_LABEL[m]}</option>)}</select></div>
                    {o.modalidad !== "por_unidad" && <div><label className="text-[11px] text-slate-400">Importe del trabajo (global)</label><input type="number" value={Number(o.importe_base) || 0} onChange={(e) => setDetalle({ ...detalle, orden: { ...o, importe_base: Number(e.target.value) } })} className={input} /></div>}
                    <div><label className="text-[11px] text-slate-400">Alcance</label><input value={o.alcance ?? ""} onChange={(e) => setDetalle({ ...detalle, orden: { ...o, alcance: e.target.value } })} className={input} /></div>
                    <div><label className="text-[11px] text-slate-400">Plazo</label><input value={o.plazo ?? ""} onChange={(e) => setDetalle({ ...detalle, orden: { ...o, plazo: e.target.value } })} className={input} /></div>
                    <div><label className="text-[11px] text-slate-400">Condiciones</label><input value={o.condiciones ?? ""} onChange={(e) => setDetalle({ ...detalle, orden: { ...o, condiciones: e.target.value } })} className={input} /></div>
                    <div><label className="text-[11px] text-slate-400">Exclusiones</label><input value={o.exclusiones ?? ""} onChange={(e) => setDetalle({ ...detalle, orden: { ...o, exclusiones: e.target.value } })} className={input} /></div>
                    <div className="sm:col-span-2"><button onClick={guardarCabecera} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Guardar datos</button></div>
                  </div>
                ) : (
                  <dl className="mb-3 space-y-1 text-xs text-slate-600">
                    {o.modalidad !== "por_unidad" && <div className="flex justify-between"><dt className="text-slate-400">Importe del trabajo</dt><dd>{gs(o.importe_base)}</dd></div>}
                    {o.alcance ? <div className="flex justify-between"><dt className="text-slate-400">Alcance</dt><dd>{o.alcance}</dd></div> : null}
                    {o.plazo ? <div className="flex justify-between"><dt className="text-slate-400">Plazo</dt><dd>{o.plazo}</dd></div> : null}
                    {o.condiciones ? <div className="flex justify-between"><dt className="text-slate-400">Condiciones</dt><dd>{o.condiciones}</dd></div> : null}
                    {o.exclusiones ? <div className="flex justify-between"><dt className="text-slate-400">Exclusiones</dt><dd>{o.exclusiones}</dd></div> : null}
                  </dl>
                )}

                {/* Partidas (por_unidad / mixta, y adicionales/descuentos) */}
                {detalle.lineas.length > 0 && (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-400"><th className="pb-1 font-medium">Partida</th><th className="pb-1 font-medium">Descripción</th><th className="pb-1 text-right font-medium">Cant.</th><th className="pb-1 text-right font-medium">P. unit.</th><th className="pb-1 text-right font-medium">Subtotal</th><th /></tr></thead>
                    <tbody>
                      {detalle.lineas.map((l) => (
                        <tr key={l.id} className="border-t border-slate-50">
                          <td className="py-1.5 text-xs text-slate-500">{TIPO_PARTIDA_LABEL[l.tipo_partida] ?? l.tipo_partida}{l.causa ? <span className="text-slate-400"> · {CAUSA_ADICIONAL_LABEL[l.causa] ?? l.causa}</span> : null}</td>
                          <td className="py-1.5">{l.descripcion}</td>
                          <td className="py-1.5 text-right">{Number(l.cantidad)}</td>
                          <td className="py-1.5 text-right font-mono">{gs(l.precio_unitario)}</td>
                          <td className={`py-1.5 text-right font-mono font-semibold ${Number(l.subtotal) < 0 ? "text-rose-600" : ""}`}>{gs(l.subtotal)}</td>
                          <td className="py-1.5 text-right">{editable && <button onClick={() => borrarLinea(o.id, l.id)} className="text-rose-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                  <div className="flex items-center gap-2">
                    {detalle.archivo_url ? <a href={detalle.archivo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#3F8E91] hover:underline"><Paperclip className="h-3.5 w-3.5" /> Ver cotización adjunta</a> : null}
                    <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><Paperclip className="h-3.5 w-3.5" /> {detalle.archivo_url ? "Reemplazar archivo" : "Adjuntar cotización"}</button>
                    <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirArchivo(o.id, f); e.target.value = ""; }} />
                  </div>
                  <span className="font-mono text-sm font-bold text-slate-800">Total: {gs(o.importe_solicitado)}</span>
                </div>

                {editable && (
                  <>
                    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                      <div className="w-28"><label className="text-[11px] text-slate-400">Partida</label><select value={nl.tipo_partida} onChange={(e) => setNl({ ...nl, tipo_partida: e.target.value })} className={input}>{TIPOS_PARTIDA.map((t) => <option key={t} value={t}>{TIPO_PARTIDA_LABEL[t]}</option>)}</select></div>
                      {nl.tipo_partida === "adicional" && <div className="w-40"><label className="text-[11px] text-slate-400">Causa</label><select value={nl.causa} onChange={(e) => setNl({ ...nl, causa: e.target.value })} className={input}>{CAUSAS_ADICIONAL.map((c) => <option key={c} value={c}>{CAUSA_ADICIONAL_LABEL[c]}</option>)}</select></div>}
                      <div className="flex-1 min-w-[120px]"><label className="text-[11px] text-slate-400">Descripción</label><input value={nl.descripcion} onChange={(e) => setNl({ ...nl, descripcion: e.target.value })} className={input} /></div>
                      <div className="w-16"><label className="text-[11px] text-slate-400">Cant.</label><input type="number" value={nl.cantidad} onChange={(e) => setNl({ ...nl, cantidad: e.target.value })} className={input} /></div>
                      <div className="w-28"><label className="text-[11px] text-slate-400">P. unit.</label><input type="number" value={nl.precio_unitario} onChange={(e) => setNl({ ...nl, precio_unitario: e.target.value })} className={input} /></div>
                      <button onClick={() => agregarLinea(o.id)} className="inline-flex items-center gap-1 rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91]"><Plus className="h-4 w-4" /> Partida</button>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button onClick={() => aprobar(o.id)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Check className="h-4 w-4" /> Aprobar cotización</button>
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
