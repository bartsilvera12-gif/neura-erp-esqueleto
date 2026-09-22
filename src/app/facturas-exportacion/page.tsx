"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TipoFactura } from "@/lib/facturas-exportacion/config";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import type { FacturaExportacion, FacturaExportacionEstado } from "@/lib/facturas-exportacion/types";

export const dynamic = "force-dynamic";

function fmt(n: number, moneda: string) {
  const dec = moneda === "PYG" ? 0 : 2;
  const s = Number(n || 0).toLocaleString("es-PY", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return `${moneda === "PYG" ? "Gs." : moneda} ${s}`;
}
function fechaES(iso: string) {
  const [y, mo, d] = iso.slice(0, 10).split("-");
  return `${d}/${mo}/${y}`;
}

export default function FacturasExportacionPage() {
  const { isAdmin } = useIsAdmin();
  const [filas, setFilas] = useState<FacturaExportacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState<"" | FacturaExportacionEstado>("");
  const [punto, setPunto] = useState<"" | string>("");
  const [tipo, setTipo] = useState<"" | TipoFactura>("");
  const [q, setQ] = useState("");
  const [modo, setModo] = useState<"" | "prueba" | "real">("");
  const [modoPrueba, setModoPrueba] = useState<boolean | null>(null);

  async function cargarModo() {
    const j = await fetch("/api/facturas-exportacion/config", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);
    const cfg = (j?.data?.config ?? []) as Array<{ modo_prueba: boolean; activo: boolean }>;
    const activos = cfg.filter((c) => c.activo);
    if (activos.length) setModoPrueba(activos.some((c) => c.modo_prueba !== false));
  }

  async function cambiarModo(prueba: boolean) {
    const msg = prueba
      ? "¿Volver a modo prueba? Las próximas facturas saldrán como PRUEBA, sin valor fiscal."
      : "¿Pasar a producción? Desde ahora cada factura usa un número REAL del timbrado 19025402.\n\nHacelo solo cuando el contador haya confirmado el uso de Zentra.";
    if (!window.confirm(msg)) return;
    const j = await fetch("/api/facturas-exportacion/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ modo_prueba: prueba }),
    }).then((r) => r.json());
    if (!j?.success) return alert(j?.error ?? "No se pudo cambiar el modo.");
    void cargarModo();
  }

  async function borrarPruebas() {
    if (!window.confirm("¿Borrar todas las facturas de PRUEBA? Las facturas reales no se tocan.")) return;
    const j = await fetch("/api/facturas-exportacion/pruebas", { method: "DELETE", credentials: "include" }).then((r) => r.json());
    if (!j?.success) return alert(j?.error ?? "No se pudieron borrar.");
    alert(`Se borraron ${j.data?.borradas ?? 0} facturas de prueba.`);
    void cargar();
  }

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      if (estado) params.set("estado", estado);
      if (punto) params.set("punto", punto);
      if (tipo) params.set("tipo", tipo);
      if (q) params.set("q", q);
      if (modo) params.set("modo", modo);
      const res = await fetch(`/api/facturas-exportacion?${params}`, { credentials: "include", cache: "no-store" });
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Error");
      setFilas(j.data?.facturas ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { void cargar(); void cargarModo(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function anular(f: FacturaExportacion) {
    const motivo = window.prompt(`Anular ${f.numero_formateado}. Motivo:`);
    if (!motivo || !motivo.trim()) return;
    const res = await fetch(`/api/facturas-exportacion/${f.id}/anular`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ motivo: motivo.trim() }),
    });
    const j = await res.json();
    if (!res.ok || !j?.success) {
      alert(j?.error ?? "No se pudo anular.");
      return;
    }
    void cargar();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Zentra · Autoimpresor
          </p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Facturación</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Timbrado 19025402 · vigencia 03/08/2026 al 31/08/2027 · puntos 001-004 y 001-005
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Link
              href="/facturas-exportacion/regularizacion"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Regularización
            </Link>
          )}
          <Link
            href="/facturas-exportacion/nueva"
            className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91]"
          >
            + Nueva factura
          </Link>
        </div>
      </div>

      {modoPrueba !== null && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            modoPrueba ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"
          }`}
        >
          <p>
            {modoPrueba ? (
              <>
                <strong>Modo prueba activado.</strong> Las facturas salen marcadas como PRUEBA, sin valor fiscal, y no usan
                los números reales del timbrado.
              </>
            ) : (
              <>
                <strong>En producción.</strong> Cada factura usa un número real del timbrado 19025402.
              </>
            )}
          </p>
          {isAdmin && (
            <div className="flex gap-2">
              {modoPrueba && (
                <button onClick={borrarPruebas} className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium hover:bg-amber-100">
                  Borrar facturas de prueba
                </button>
              )}
              <button
                onClick={() => cambiarModo(!modoPrueba)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${modoPrueba ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}`}
              >
                {modoPrueba ? "Pasar a producción" : "Volver a modo prueba"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="zx-surface zx-surface-accent p-6">
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-7">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as "" | TipoFactura)} className="zx-surface w-full px-3 py-2 text-sm">
              <option value="">Todas</option>
              <option value="EXPORTACION">Exportación</option>
              <option value="LOCAL">Local</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Prueba / real</label>
            <select value={modo} onChange={(e) => setModo(e.target.value as "" | "prueba" | "real")} className="zx-surface w-full px-3 py-2 text-sm">
              <option value="">Todas</option>
              <option value="real">Reales</option>
              <option value="prueba">De prueba</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Estado</label>
            <select value={estado} onChange={(e) => setEstado(e.target.value as "" | FacturaExportacionEstado)} className="zx-surface w-full px-3 py-2 text-sm">
              <option value="">Todos</option>
              <option value="EMITIDA">Emitidas</option>
              <option value="ANULADA">Anuladas</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Punto</label>
            <select value={punto} onChange={(e) => setPunto(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm">
              <option value="">Todos</option>
              {["004", "005"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Cliente</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre…" className="zx-surface w-full px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mb-4 flex gap-2">
          <button onClick={() => void cargar()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
            Aplicar filtros
          </button>
          <button
            onClick={() => { setDesde(""); setHasta(""); setEstado(""); setPunto(""); setTipo(""); setModo(""); setQ(""); setTimeout(cargar, 0); }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
          >
            Limpiar
          </button>
        </div>

        {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Número</th>
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Cliente</th>
                <th className="py-2 pr-3">País</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Emitida por</th>
                <th className="py-2 pr-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr><td colSpan={9} className="py-8 text-center text-slate-400">Cargando…</td></tr>
              )}
              {!cargando && filas.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-slate-400">No hay facturas con esos filtros.</td></tr>
              )}
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                  <td className="py-2 pr-3 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${f.tipo === "LOCAL" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>
                      {f.tipo === "LOCAL" ? "Local" : "Exportación"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-slate-800">
                    {f.numero_formateado}
                    {f.prueba && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Prueba</span>}
                    {f.regularizacion_id && <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">Reemisión</span>}
                  </td>
                  <td className="py-2 pr-3">{fechaES(f.fecha)}</td>
                  <td className="py-2 pr-3">{f.cliente_nombre}</td>
                  <td className="py-2 pr-3">{f.cliente_pais}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt(f.total, f.moneda)}</td>
                  <td className="py-2 pr-3">
                    {f.estado === "ANULADA" ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Anulada</span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Emitida</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-500">{f.created_by_nombre ?? "—"}</td>
                  <td className="py-2 pr-3 text-right">
                    <div className="inline-flex gap-2">
                      <a
                        href={`/api/facturas-exportacion/${f.id}/pdf`}
                        target="_blank"
                        rel="noopener"
                        className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        PDF
                      </a>
                      {isAdmin && f.estado === "EMITIDA" && (
                        <button
                          onClick={() => anular(f)}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Anular
                        </button>
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
