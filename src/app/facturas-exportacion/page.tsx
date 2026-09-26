"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TipoFactura } from "@/lib/facturas-exportacion/config";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import ConfirmModal from "@/components/ui/ConfirmModal";
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
/** Día y hora (hora de Paraguay) de un timestamp: "23/09/2026 14:32". */
function fechaHora(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-PY", {
    timeZone: "America/Asuncion",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(",", "");
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

  type Pendiente =
    | { tipo: "modo"; prueba: boolean }
    | { tipo: "borrador"; f: FacturaExportacion }
    | { tipo: "prueba"; f: FacturaExportacion }
    | { tipo: "pruebas" }
    | { tipo: "anular"; f: FacturaExportacion };
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [motivo, setMotivo] = useState("");
  const [motivoError, setMotivoError] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const cambiarModo = (prueba: boolean) => setPendiente({ tipo: "modo", prueba });
  const borrarBorrador = (f: FacturaExportacion) => setPendiente({ tipo: "borrador", f });
  const borrarPruebas = () => setPendiente({ tipo: "pruebas" });
  const eliminarPrueba = (f: FacturaExportacion) => setPendiente({ tipo: "prueba", f });
  const anular = (f: FacturaExportacion) => {
    setMotivo("");
    setMotivoError(false);
    setPendiente({ tipo: "anular", f });
  };

  async function ejecutarPendiente() {
    if (!pendiente || procesando) return;
    if (pendiente.tipo === "anular" && !motivo.trim()) return setMotivoError(true);
    setProcesando(true);
    try {
      let j: { success?: boolean; error?: string; data?: { borradas?: number } } | null = null;
      if (pendiente.tipo === "modo") {
        j = await fetch("/api/facturas-exportacion/config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ modo_prueba: pendiente.prueba }),
        }).then((r) => r.json());
      } else if (pendiente.tipo === "borrador" || pendiente.tipo === "prueba") {
        j = await fetch(`/api/facturas-exportacion/${pendiente.f.id}`, { method: "DELETE", credentials: "include" }).then((r) => r.json());
      } else if (pendiente.tipo === "pruebas") {
        j = await fetch("/api/facturas-exportacion/pruebas", { method: "DELETE", credentials: "include" }).then((r) => r.json());
      } else {
        j = await fetch(`/api/facturas-exportacion/${pendiente.f.id}/anular`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ motivo: motivo.trim() }),
        }).then((r) => r.json());
      }
      if (!j?.success) {
        setAviso({ tipo: "error", texto: j?.error ?? "No se pudo completar la acción." });
      } else {
        setAviso({
          tipo: "ok",
          texto:
            pendiente.tipo === "modo"
              ? pendiente.prueba ? "Volviste a modo prueba." : "Facturación en producción: desde ahora se usan números reales."
              : pendiente.tipo === "borrador"
              ? "Borrador borrado."
              : pendiente.tipo === "prueba"
              ? `Factura de prueba ${pendiente.f.numero_formateado ?? ""} eliminada.`
              : pendiente.tipo === "pruebas"
              ? `Se borraron ${j.data?.borradas ?? 0} facturas de prueba.`
              : `Factura ${pendiente.f.numero_formateado} anulada.`,
        });
        if (pendiente.tipo === "modo") void cargarModo();
        else void cargar();
      }
    } catch {
      setAviso({ tipo: "error", texto: "Error de conexión. Probá de nuevo." });
    } finally {
      setProcesando(false);
      setPendiente(null);
    }
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
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <>
              <Link
                href="/facturas-exportacion/configuracion"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Timbrado
              </Link>
              <Link
                href="/facturas-exportacion/historial"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Historial
              </Link>
            </>
          )}
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

      <ConfirmModal
        open={pendiente !== null}
        loading={procesando}
        tone={pendiente?.tipo === "modo" && !pendiente.prueba ? "primary" : pendiente?.tipo === "modo" ? "primary" : "danger"}
        title={
          pendiente?.tipo === "modo"
            ? pendiente.prueba ? "Volver a modo prueba" : "Pasar a producción"
            : pendiente?.tipo === "borrador"
            ? "Borrar borrador"
            : pendiente?.tipo === "prueba"
            ? `Eliminar factura de prueba ${pendiente.f.numero_formateado ?? ""}`
            : pendiente?.tipo === "pruebas"
            ? "Borrar facturas de prueba"
            : `Anular factura ${pendiente?.tipo === "anular" ? pendiente.f.numero_formateado ?? "" : ""}`
        }
        confirmLabel={
          pendiente?.tipo === "modo"
            ? pendiente.prueba ? "Volver a prueba" : "Pasar a producción"
            : pendiente?.tipo === "anular" ? "Anular" : pendiente?.tipo === "prueba" ? "Eliminar" : "Borrar"
        }
        message={
          pendiente?.tipo === "modo" ? (
            pendiente.prueba ? (
              "Las próximas facturas saldrán como PRUEBA, sin valor fiscal."
            ) : (
              <>
                Desde ahora cada factura usa un número <strong>real</strong> del timbrado 19025402.
                <br />
                Hacelo solo cuando el contador haya confirmado el uso de Zentra.
              </>
            )
          ) : pendiente?.tipo === "borrador" ? (
            "El borrador no tiene número, así que borrarlo no afecta la numeración."
          ) : pendiente?.tipo === "prueba" ? (
            "Es una factura de PRUEBA, sin valor fiscal: se elimina por completo. Las facturas reales no se pueden eliminar, solo anular."
          ) : pendiente?.tipo === "pruebas" ? (
            "Se borran todas las facturas de PRUEBA y su numeración vuelve a 1. Las facturas reales no se tocan."
          ) : (
            <div className="space-y-2">
              <p>La factura queda anulada y su número no se vuelve a usar. Esto no se puede deshacer.</p>
              <label className="block text-xs font-medium text-slate-500">Motivo de la anulación *</label>
              <textarea
                rows={2}
                value={motivo}
                onChange={(e) => { setMotivo(e.target.value); setMotivoError(false); }}
                className="zx-surface w-full px-3 py-2 text-sm"
                placeholder="Ej: error en el precio"
              />
              {motivoError && <p className="text-xs text-red-600">Escribí el motivo para poder anular.</p>}
            </div>
          )
        }
        onConfirm={() => void ejecutarPendiente()}
        onCancel={() => setPendiente(null)}
      />

      {aviso && (
        <div
          className={`flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm ${
            aviso.tipo === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          <span>{aviso.texto}</span>
          <button onClick={() => setAviso(null)} className="text-xs opacity-70 hover:opacity-100" aria-label="Cerrar aviso">✕</button>
        </div>
      )}

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

      <div className="zx-surface zx-surface-accent p-4 sm:p-6">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
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
              <option value="BORRADOR">Borradores</option>
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
            <label className="mb-1 block text-xs text-slate-500">Cliente o número</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void cargar(); }} placeholder="Nombre o 0000012…" className="zx-surface w-full px-3 py-2 text-sm" />
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
                    {f.numero_formateado ?? <span className="font-sans text-xs text-slate-400">sin número</span>}
                    {f.prueba && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Prueba</span>}
                    {f.regularizacion_id && <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">Reemisión</span>}
                  </td>
                  <td className="py-2 pr-3">
                    {fechaES(f.fecha)}
                    <div className="whitespace-nowrap text-[11px] text-slate-400">
                      {f.estado === "BORRADOR"
                        ? `Guardado ${fechaHora(f.updated_at ?? f.created_at)}`
                        : `Emitida ${fechaHora(f.emitida_at ?? f.created_at)}`}
                    </div>
                  </td>
                  <td className="py-2 pr-3">{f.cliente_nombre}</td>
                  <td className="py-2 pr-3">{f.cliente_pais}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt(f.total, f.moneda)}</td>
                  <td className="py-2 pr-3">
                    {f.estado === "ANULADA" ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Anulada</span>
                    ) : f.estado === "BORRADOR" ? (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Borrador</span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Emitida</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-500">{f.created_by_nombre ?? "—"}</td>
                  <td className="py-2 pr-3 text-right">
                    <div className="inline-flex gap-2">
                      {f.estado === "BORRADOR" ? (
                        <>
                          <Link
                            href={`/facturas-exportacion/nueva?borrador=${f.id}`}
                            className="rounded border border-[#4FAEB2] px-2 py-1 text-xs font-medium text-[#3F8E91] hover:bg-[#4FAEB2]/10"
                          >
                            Continuar
                          </Link>
                          <button onClick={() => borrarBorrador(f)} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                            Borrar
                          </button>
                        </>
                      ) : (
                      <a
                        href={`/api/facturas-exportacion/${f.id}/pdf`}
                        target="_blank"
                        rel="noopener"
                        className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Imprimir
                      </a>
                      )}
                      {isAdmin && f.estado === "EMITIDA" && (
                        <Link
                          href={`/facturas-exportacion/nueva?editar=${f.id}&tipo=${f.tipo}`}
                          className="rounded border border-[#4FAEB2] px-2 py-1 text-xs font-medium text-[#3F8E91] hover:bg-[#4FAEB2]/10"
                        >
                          Editar
                        </Link>
                      )}
                      {isAdmin && f.prueba && f.estado !== "BORRADOR" && (
                        <button
                          onClick={() => eliminarPrueba(f)}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Eliminar
                        </button>
                      )}
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
