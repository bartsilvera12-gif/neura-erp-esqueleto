"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useIsAdmin } from "@/lib/auth/use-is-admin";

export const dynamic = "force-dynamic";

interface Registro {
  id: string;
  factura_id: string | null;
  factura_numero: string | null;
  factura_prueba: boolean | null;
  accion: string;
  detalle: Record<string, unknown> | null;
  usuario_nombre: string | null;
  created_at: string;
}

const ACCIONES: Record<string, string> = {
  EMITIR: "Emitió factura",
  REEMITIR: "Reemitió factura de agosto",
  ANULAR: "Anuló factura",
  IMPRIMIR: "Imprimió factura",
  REIMPRIMIR: "Reimprimió factura",
  BORRADOR_CREAR: "Creó borrador",
  BORRADOR_MODIFICAR: "Modificó borrador",
  BORRADOR_ELIMINAR: "Borró borrador",
  REGULARIZACION_REGISTRAR: "Registró factura de agosto",
  REGULARIZACION_MODIFICAR: "Cambió factura de agosto",
  REGULARIZACION_ADJUNTAR_PDF: "Adjuntó PDF original",
  CONFIG_CREAR: "Agregó punto / timbrado",
  CONFIG_MODIFICAR: "Cambió timbrado o numeración",
  PASAR_A_PRODUCCION: "Pasó a producción",
  ACTIVAR_MODO_PRUEBA: "Volvió a modo prueba",
  BORRAR_PRUEBAS: "Borró facturas de prueba",
};

const CAMPOS: Record<string, string> = {
  estado: "estado",
  motivo: "motivo",
  observaciones: "observaciones",
  timbrado: "timbrado",
  vigencia_desde: "vigencia desde",
  vigencia_hasta: "vigencia hasta",
  rango_desde: "número desde",
  rango_hasta: "número hasta",
  proximo_numero: "próximo número",
  activo: "activo",
  ruc: "RUC",
  autoimpresor_nro: "Nº autorización",
};

function describir(r: Registro): string {
  const d = r.detalle ?? {};
  const partes: string[] = [];
  if (typeof d.motivo === "string" && r.accion === "ANULAR") partes.push(`Motivo: ${d.motivo}`);
  if (d.numero_original) partes.push(`Factura original ${String(d.numero_original)}`);
  if (d.punto && r.accion.startsWith("CONFIG")) partes.push(`Punto ${String(d.punto)}`);
  if (typeof d.borradas === "number") partes.push(`${d.borradas} facturas`);
  if (d.total != null && d.moneda) partes.push(`Total ${String(d.moneda)} ${Number(d.total).toLocaleString("es-PY")}`);
  const antes = d.antes as Record<string, unknown> | undefined;
  const despues = d.despues as Record<string, unknown> | undefined;
  if (antes && despues && r.accion !== "ANULAR") {
    for (const k of Object.keys(despues)) {
      partes.push(`${CAMPOS[k] ?? k}: ${String(antes[k] ?? "—")} → ${String(despues[k] ?? "—")}`);
    }
  }
  return partes.join(" · ");
}

export default function HistorialPage() {
  const { isAdmin, loaded } = useIsAdmin();
  const [filas, setFilas] = useState<Registro[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [accion, setAccion] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      const qs = new URLSearchParams();
      if (desde) qs.set("desde", desde);
      if (hasta) qs.set("hasta", hasta);
      if (accion) qs.set("accion", accion);
      const j = await fetch(`/api/facturas-exportacion/auditoria?${qs}`, { credentials: "include", cache: "no-store" }).then((r) => r.json());
      if (!j?.success) throw new Error(j?.error ?? "Error");
      setFilas(j.data?.auditoria ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }
  useEffect(() => { void cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [accion]);

  if (loaded && !isAdmin) {
    return <div className="zx-surface p-6 text-sm text-slate-600">Solo un administrador puede ver el historial.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Zentra · Autoimpresor</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Historial de facturación</h1>
          <p className="mt-0.5 text-xs text-slate-500">Quién hizo qué, cuándo y por qué. No se puede modificar ni borrar.</p>
        </div>
        <Link href="/facturas-exportacion" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          ← Volver
        </Link>
      </div>

      <div className="zx-surface zx-surface-accent p-4 sm:p-6">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Acción</label>
            <select value={accion} onChange={(e) => setAccion(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm">
              <option value="">Todas</option>
              {Object.entries(ACCIONES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
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
          <div className="flex items-end">
            <button onClick={() => void cargar()} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">
              Filtrar
            </button>
          </div>
        </div>

        {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Fecha y hora</th>
                <th className="py-2 pr-3">Usuario</th>
                <th className="py-2 pr-3">Acción</th>
                <th className="py-2 pr-3">Factura</th>
                <th className="py-2 pr-3">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {cargando && <tr><td colSpan={5} className="py-8 text-center text-slate-400">Cargando…</td></tr>}
              {!cargando && filas.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">Sin movimientos.</td></tr>}
              {filas.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-xs text-slate-600">
                    {new Date(r.created_at).toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="py-2 pr-3 text-xs">{r.usuario_nombre ?? "—"}</td>
                  <td className="py-2 pr-3 font-medium text-slate-800">{ACCIONES[r.accion] ?? r.accion}</td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {r.factura_numero ?? (r.factura_id ? "borrador" : "—")}
                    {r.factura_prueba && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-amber-700">Prueba</span>}
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-600">{describir(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
