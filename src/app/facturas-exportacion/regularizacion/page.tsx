"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import type { FacturaRegularizacion, RegularizacionEstado } from "@/lib/facturas-exportacion/types";

export const dynamic = "force-dynamic";

const ESTADOS: Record<RegularizacionEstado, { label: string; cls: string }> = {
  PENDIENTE: { label: "Pendiente", cls: "bg-amber-100 text-amber-800" },
  CORRECTA: { label: "Correcta", cls: "bg-emerald-100 text-emerald-700" },
  ANULADA: { label: "Anulada", cls: "bg-red-100 text-red-700" },
  PENDIENTE_REEMISION: { label: "Pendiente de reemisión", cls: "bg-violet-100 text-violet-700" },
  REEMITIDA: { label: "Reemitida", cls: "bg-sky-100 text-sky-700" },
};

const input = "zx-surface w-full px-3 py-2 text-sm";
const lbl = "mb-1 block text-xs font-medium text-slate-500";
const vacio = {
  numero_original: "",
  fecha_original: "",
  timbrado_original: "17943433",
  punto_original: "",
  cliente_nombre: "",
  cliente_pais: "",
  moneda: "USD",
  total: "",
  motivo: "Timbrado incorrecto",
  observaciones: "",
};

const fechaES = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
/** Tipo de la factura nueva: en guaraníes y en Paraguay es local; el resto, exportación. */
const tipoReemision = (r: FacturaRegularizacion) =>
  r.moneda === "PYG" && (r.cliente_pais ?? "PARAGUAY").trim().toUpperCase() === "PARAGUAY" ? "LOCAL" : "EXPORTACION";
const fmt = (n: number, m: string) =>
  `${m === "PYG" ? "Gs." : m} ${Number(n || 0).toLocaleString("es-PY", {
    minimumFractionDigits: m === "PYG" ? 0 : 2,
    maximumFractionDigits: m === "PYG" ? 0 : 2,
  })}`;

export default function RegularizacionPage() {
  const { isAdmin, loaded } = useIsAdmin();
  const [filas, setFilas] = useState<FacturaRegularizacion[]>([]);
  const [filtro, setFiltro] = useState<"" | RegularizacionEstado>("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(vacio);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [pdfNuevo, setPdfNuevo] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [subiendoId, setSubiendoId] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      const qs = filtro ? `?estado=${filtro}` : "";
      const j = await fetch(`/api/facturas-regularizacion${qs}`, { credentials: "include", cache: "no-store" }).then((r) => r.json());
      if (!j?.success) throw new Error(j?.error ?? "Error");
      setFilas(j.data?.regularizaciones ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { void cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filtro]);

  async function subirPdf(id: string, file: File) {
    setSubiendoId(id);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const j = await fetch(`/api/facturas-regularizacion/${id}/pdf`, { method: "POST", body: fd, credentials: "include" }).then((r) => r.json());
      if (!j?.success) setError(j?.error ?? "No se pudo subir el PDF.");
    } finally {
      setSubiendoId(null);
    }
  }

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const j = await fetch("/api/facturas-regularizacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...form, total: Number(form.total) || 0 }),
      }).then((r) => r.json());
      if (!j?.success) return setError(j?.error ?? "No se pudo registrar.");
      const id = j.data?.regularizacion?.id as string | undefined;
      if (id && pdfNuevo) await subirPdf(id, pdfNuevo);
      setForm(vacio);
      setPdfNuevo(null);
      if (fileRef.current) fileRef.current.value = "";
      setMostrarForm(false);
      void cargar();
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(r: FacturaRegularizacion, estado: RegularizacionEstado) {
    if (estado === r.estado) return;
    const j = await fetch(`/api/facturas-regularizacion/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estado }),
    }).then((res) => res.json());
    if (!j?.success) setError(j?.error ?? "No se pudo cambiar el estado.");
    void cargar();
  }

  if (loaded && !isAdmin) {
    return <div className="zx-surface p-6 text-sm text-slate-600">Solo un administrador puede ver la regularización.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Zentra · Autoimpresor</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Regularización de facturas de agosto</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
            Acá solo se anotan las facturas que hizo el sistema anterior con el timbrado incorrecto (número, fecha,
            cliente y total) y se adjunta su PDF. Anotarlas no genera una factura nueva ni usa números.
            <br />
            Para <strong>cargar los productos e imprimir</strong> la factura correcta, tocá <strong>Reemitir</strong>: se
            abre una factura nueva con los datos del cliente, se agregan los productos, se emite y se imprime. Las dos
            quedan vinculadas.
          </p>
        </div>
        <div className="flex gap-2">
        <Link href="/facturas-exportacion" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          ← Volver
        </Link>
        <button
          type="button"
          onClick={() => setMostrarForm((v) => !v)}
          className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91]"
        >
          {mostrarForm ? "Cerrar" : "+ Registrar factura de agosto"}
        </button>
        </div>
      </div>

      {mostrarForm && (
        <form onSubmit={registrar} className="zx-surface space-y-4 p-6">
          <h2 className="text-sm font-semibold text-slate-800">Datos de la factura original</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className={lbl}>Número original *</label>
              <input value={form.numero_original} onChange={(e) => setForm({ ...form, numero_original: e.target.value })} className={input} placeholder="001-001-0000107" />
            </div>
            <div>
              <label className={lbl}>Fecha original *</label>
              <input type="date" value={form.fecha_original} onChange={(e) => setForm({ ...form, fecha_original: e.target.value })} className={input} />
            </div>
            <div>
              <label className={lbl}>Timbrado original *</label>
              <input value={form.timbrado_original} onChange={(e) => setForm({ ...form, timbrado_original: e.target.value })} className={input} />
            </div>
            <div>
              <label className={lbl}>Punto de expedición</label>
              <input value={form.punto_original} onChange={(e) => setForm({ ...form, punto_original: e.target.value })} className={input} placeholder="001" />
            </div>
            <div className="md:col-span-2">
              <label className={lbl}>Cliente *</label>
              <input value={form.cliente_nombre} onChange={(e) => setForm({ ...form, cliente_nombre: e.target.value })} className={input} />
            </div>
            <div>
              <label className={lbl}>País</label>
              <input value={form.cliente_pais} onChange={(e) => setForm({ ...form, cliente_pais: e.target.value })} className={input} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lbl}>Moneda</label>
                <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })} className={input}>
                  <option value="USD">USD</option>
                  <option value="PYG">PYG</option>
                  <option value="BOB">BOB</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Total</label>
                <input type="number" min="0" step="0.01" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} className={input} />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className={lbl}>Motivo *</label>
              <input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} className={input} />
            </div>
            <div className="md:col-span-2">
              <label className={lbl}>PDF original</label>
              <input ref={fileRef} type="file" accept="application/pdf" onChange={(e) => setPdfNuevo(e.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-600" />
            </div>
            <div className="md:col-span-4">
              <label className={lbl}>Observaciones</label>
              <input value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} className={input} />
            </div>
          </div>
          {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <button type="submit" disabled={guardando} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
            {guardando ? "Guardando…" : "Registrar"}
          </button>
        </form>
      )}

      <div className="zx-surface zx-surface-accent p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {([["", "Todas"], ...Object.entries(ESTADOS).map(([k, v]) => [k, v.label])] as [string, string][]).map(([k, label]) => (
            <button
              key={k || "todas"}
              type="button"
              onClick={() => setFiltro(k as "" | RegularizacionEstado)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${filtro === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Factura original</th>
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Cliente</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-3">Motivo</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Factura nueva</th>
                <th className="py-2 pr-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando && <tr><td colSpan={8} className="py-8 text-center text-slate-400">Cargando…</td></tr>}
              {!cargando && filas.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-slate-400">No hay facturas registradas.</td></tr>
              )}
              {filas.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 align-top hover:bg-slate-50/70">
                  <td className="py-2 pr-3">
                    <p className="font-mono text-slate-800">{r.numero_original}</p>
                    <p className="text-[11px] text-slate-400">Timbrado {r.timbrado_original}</p>
                  </td>
                  <td className="py-2 pr-3">{fechaES(r.fecha_original)}</td>
                  <td className="py-2 pr-3">
                    {r.cliente_nombre}
                    {r.cliente_pais && <p className="text-[11px] text-slate-400">{r.cliente_pais}</p>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.total, r.moneda)}</td>
                  <td className="py-2 pr-3 text-xs text-slate-600">{r.motivo}</td>
                  <td className="py-2 pr-3">
                    {r.estado === "REEMITIDA" ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADOS.REEMITIDA.cls}`}>Reemitida</span>
                    ) : (
                      <select
                        value={r.estado}
                        onChange={(e) => cambiarEstado(r, e.target.value as RegularizacionEstado)}
                        className={`rounded-full border-0 px-2 py-0.5 text-xs font-semibold ${ESTADOS[r.estado].cls}`}
                      >
                        {(["PENDIENTE", "CORRECTA", "ANULADA", "PENDIENTE_REEMISION"] as RegularizacionEstado[]).map((k) => (
                          <option key={k} value={k}>{ESTADOS[k].label}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {r.factura_vinculada_id ? (
                      <a href={`/api/facturas-exportacion/${r.factura_vinculada_id}/pdf`} target="_blank" rel="noopener" className="font-mono text-xs text-[#3F8E91] hover:underline">
                        {r.factura_vinculada_numero ?? "Ver"}
                      </a>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-2">
                      {r.pdf_path ? (
                        <a href={`/api/facturas-regularizacion/${r.id}/pdf`} target="_blank" rel="noopener" className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                          PDF original
                        </a>
                      ) : (
                        <label className="cursor-pointer rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50">
                          {subiendoId === r.id ? "Subiendo…" : "Adjuntar PDF"}
                          <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (f) { await subirPdf(r.id, f); void cargar(); }
                            }}
                          />
                        </label>
                      )}
                      {r.factura_vinculada_id && (
                        <a
                          href={`/api/facturas-exportacion/${r.factura_vinculada_id}/pdf`}
                          target="_blank"
                          rel="noopener"
                          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          Imprimir
                        </a>
                      )}
                      {r.estado !== "REEMITIDA" && r.estado !== "CORRECTA" && r.estado !== "ANULADA" && (
                        <Link
                          href={`/facturas-exportacion/nueva?reemite=${r.id}&tipo=${tipoReemision(r)}`}
                          title="Abre una factura nueva con los datos del cliente para cargar los productos e imprimirla"
                          className="rounded border border-[#4FAEB2] px-2 py-1 text-xs font-medium text-[#3F8E91] hover:bg-[#4FAEB2]/10"
                        >
                          Reemitir
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
