"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type {
  EstadoImportacion,
  Importacion,
  ImportacionCajaMov,
  ImportacionItem,
} from "@/lib/importaciones/types";

const ESTADOS: EstadoImportacion[] = [
  "borrador",
  "en_transito",
  "arribado",
  "nacionalizada",
  "entregada",
  "cerrada",
  "anulada",
];

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

function formatMoney(v: number, moneda: string) {
  return `${moneda} ${Math.round(v).toLocaleString("es-PY")}`;
}

export default function ImportacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [imp, setImp] = useState<Importacion | null>(null);
  const [items, setItems] = useState<ImportacionItem[]>([]);
  const [caja, setCaja] = useState<ImportacionCajaMov[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalItem, setModalItem] = useState(false);
  const [modalCaja, setModalCaja] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rI, rIt, rC] = await Promise.all([
        fetchWithSupabaseSession(`/api/importaciones/${id}`, { cache: "no-store" }),
        fetchWithSupabaseSession(`/api/importaciones/${id}/items`, { cache: "no-store" }),
        fetchWithSupabaseSession(`/api/importaciones/${id}/caja`, { cache: "no-store" }),
      ]);
      const jI = await rI.json();
      const jIt = await rIt.json();
      const jC = await rC.json();
      if (!rI.ok) throw new Error(jI?.error ?? `Error ${rI.status}`);
      setImp(jI.data.importacion as Importacion);
      setItems((jIt.data?.items ?? []) as ImportacionItem[]);
      setCaja((jC.data?.movimientos ?? []) as ImportacionCajaMov[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function cambiarEstado(nuevo: EstadoImportacion) {
    try {
      const r = await fetchWithSupabaseSession(`/api/importaciones/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ estado: nuevo }),
      });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    }
  }

  const totalItems = items.reduce((s, i) => s + Number(i.subtotal), 0);
  const totalEntradas = caja.filter((m) => m.tipo === "entrada").reduce((s, m) => s + Number(m.monto), 0);
  const totalSalidas = caja.filter((m) => m.tipo === "salida").reduce((s, m) => s + Number(m.monto), 0);

  return (
    <div className="space-y-6">
      <Link
        href="/importaciones"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Importaciones
      </Link>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {loading && <p className="text-sm text-slate-500">Cargando…</p>}

      {imp && (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Zentra · Importaciones
              </p>
              <h1 className="text-2xl font-semibold text-slate-900">
                <span className="font-mono">{imp.numero}</span> — {imp.proveedor_nombre ?? "—"}
              </h1>
              <p className="text-sm text-slate-600">
                Origen {imp.pais_origen} · Incoterm {imp.incoterm ?? "—"} · Monto estimado{" "}
                {formatMoney(imp.monto_estimado, imp.moneda)}
              </p>
            </div>
            <div>
              <label className={labelClass}>Estado</label>
              <select
                value={imp.estado}
                onChange={(e) => cambiarEstado(e.target.value as EstadoImportacion)}
                className={`${inputClass} min-w-[180px]`}
              >
                {ESTADOS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </header>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total ítems</p>
              <p className="mt-1 text-lg font-semibold text-slate-800">{formatMoney(totalItems, imp.moneda)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Entradas de caja</p>
              <p className="mt-1 text-lg font-semibold text-emerald-700">
                {formatMoney(totalEntradas, imp.moneda)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Salidas de caja</p>
              <p className="mt-1 text-lg font-semibold text-rose-700">
                {formatMoney(totalSalidas, imp.moneda)}
              </p>
            </div>
          </div>

          {/* ITEMS */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">Mercadería esperada</h2>
              <button
                onClick={() => setModalItem(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar ítem
              </button>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3 text-right">Cantidad</th>
                    <th className="px-4 py-3 text-right">P. Unit.</th>
                    <th className="px-4 py-3 text-right">Subtotal</th>
                    <th className="px-4 py-3 text-right">Recibido</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                        Sin ítems.
                      </td>
                    </tr>
                  )}
                  {items.map((it) => (
                    <tr key={it.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{it.producto_nombre}</div>
                        {it.sku && <div className="text-xs text-slate-500">{it.sku}</div>}
                      </td>
                      <td className="px-4 py-3 text-right">{Number(it.cantidad).toLocaleString("es-PY")}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(it.precio_unitario, it.moneda)}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatMoney(it.subtotal, it.moneda)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {Number(it.cantidad_recibida).toLocaleString("es-PY")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* CAJA */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">Caja de importación</h2>
              <button
                onClick={() => setModalCaja(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                <Plus className="h-3.5 w-3.5" /> Registrar movimiento
              </button>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Concepto</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3">Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {caja.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                        Sin movimientos.
                      </td>
                    </tr>
                  )}
                  {caja.map((m) => (
                    <tr key={m.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-700">{m.fecha}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            m.tipo === "entrada"
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                              : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                          }`}
                        >
                          {m.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-800">{m.concepto}</td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          m.tipo === "entrada" ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {m.tipo === "entrada" ? "+" : "-"}
                        {formatMoney(m.monto, m.moneda)}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{m.usuario_nombre ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {modalItem && imp && (
        <ModalNuevoItem importacion={imp} onClose={() => setModalItem(false)} onSaved={load} />
      )}
      {modalCaja && imp && (
        <ModalNuevoCaja importacion={imp} onClose={() => setModalCaja(false)} onSaved={load} />
      )}
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function ModalNuevoItem({
  importacion,
  onClose,
  onSaved,
}: {
  importacion: Importacion;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [sku, setSku] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [precio, setPrecio] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/importaciones/${importacion.id}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          producto_nombre: nombre,
          sku: sku || undefined,
          cantidad: Number(cantidad),
          precio_unitario: Number(precio) || 0,
          moneda: importacion.moneda,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `Error ${r.status}`);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Agregar ítem" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelClass}>Producto *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>SKU</label>
            <input value={sku} onChange={(e) => setSku(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Cantidad *</label>
            <input type="number" step="any" min={0} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={inputClass} required />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Precio unitario ({importacion.moneda})</label>
            <input type="number" step="any" min={0} value={precio} onChange={(e) => setPrecio(e.target.value)} className={inputClass} />
          </div>
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalNuevoCaja({
  importacion,
  onClose,
  onSaved,
}: {
  importacion: Importacion;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<"entrada" | "salida">("salida");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/importaciones/${importacion.id}/caja`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tipo,
          concepto,
          monto: Number(monto),
          moneda: importacion.moneda,
          fecha,
          referencia: ref || undefined,
          observacion: obs || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `Error ${r.status}`);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Nuevo movimiento de caja" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as "entrada" | "salida")} className={inputClass}>
              <option value="salida">Salida</option>
              <option value="entrada">Entrada</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Concepto *</label>
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} className={inputClass} required />
        </div>
        <div>
          <label className={labelClass}>Monto ({importacion.moneda}) *</label>
          <input type="number" step="any" min={0} value={monto} onChange={(e) => setMonto(e.target.value)} className={inputClass} required />
        </div>
        <div>
          <label className={labelClass}>Referencia</label>
          <input value={ref} onChange={(e) => setRef(e.target.value)} className={inputClass} maxLength={100} />
        </div>
        <div>
          <label className={labelClass}>Observación</label>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={inputClass} maxLength={500} />
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
