"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import type { Incidencia } from "@/lib/comex/types";
import { ESTADO_INCIDENCIA_LABEL, TIPO_INCIDENCIA_LABEL, incidenciaAbierta } from "@/lib/comex/estados";
import { Aviso, api, fechaES, fechaHora, hoyPY, nombreDe, useUsuarios } from "@/components/comex/ui";

const MODULO: Record<string, string> = { IMPORTACION: "Importación", EXPORTACION: "Exportación", CONTENEDOR: "Contenedor", CONTEO: "Inventario físico", COMPROMISO: "Proveedor" };

function Registro() {
  const params = useSearchParams();
  const usuarios = useUsuarios();
  const [lista, setLista] = useState<Incidencia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ estado: "abiertas", modulo: "", responsable: params.get("mias") ? "yo" : "", vencidas: params.get("vencidas") === "1" });
  const [yo, setYo] = useState<string | null>(null);
  const hoy = hoyPY();
  // Si se llega desde la campanita estando ya en esta pantalla, se aplican los filtros del enlace.
  const pMias = params.get("mias");
  const pVencidas = params.get("vencidas");
  useEffect(() => {
    setF((x) => ({ ...x, responsable: pMias ? "yo" : x.responsable, vencidas: pVencidas === "1" }));
  }, [pMias, pVencidas]);

  useEffect(() => {
    api<{ usuario_id: string | null }>("/api/comex/yo")
      .then((d) => setYo(d.usuario_id))
      .catch(() => undefined);
  }, []);
  const cargar = useCallback(async () => {
    try {
      setLista((await api<{ incidencias: Incidencia[] }>(`/api/comex/incidencias${f.estado === "abiertas" ? "?estado=abiertas" : ""}`)).incidencias);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [f.estado]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtradas = lista.filter(
    (i) =>
      (!f.modulo || i.origen_tipo === f.modulo) &&
      (!f.responsable || (f.responsable === "yo" ? yo && i.responsable_id === yo : i.responsable_id === f.responsable)) &&
      (!f.vencidas || (i.fecha_limite && i.fecha_limite < hoy && incidenciaAbierta(i.estado)))
  );
  const resueltas = lista.filter((i) => i.resuelto_at);
  const promedioHs = resueltas.length ? Math.round(resueltas.reduce((s, i) => s + (Date.parse(i.resuelto_at as string) - Date.parse(i.created_at)) / 3600000, 0) / resueltas.length) : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Comercio exterior</p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <AlertTriangle className="h-6 w-6 text-slate-500" /> Registro de incidencias
        </h1>
        <p className="text-sm text-slate-600">Todos los errores y problemas de importaciones, exportaciones, inventario físico y proveedores, con su responsable y su resolución.</p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="abiertas">Sin resolver</option>
          <option value="todas">Todas</option>
        </select>
        <select value={f.modulo} onChange={(e) => setF({ ...f, modulo: e.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">Todos los módulos</option>
          {Object.entries(MODULO).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={f.responsable} onChange={(e) => setF({ ...f, responsable: e.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">Todos los responsables</option>
          <option value="yo">Asignadas a mí</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>{nombreDe(u)}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={f.vencidas} onChange={(e) => setF({ ...f, vencidas: e.target.checked })} /> Solo con plazo vencido
        </label>
        {promedioHs !== null && <span className="ml-auto text-xs text-slate-500">Tiempo promedio de resolución: {promedioHs < 48 ? `${promedioHs} h` : `${Math.round(promedioHs / 24)} días`}</span>}
      </div>
      {error && <Aviso>{error}</Aviso>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Módulo / operación</th>
              <th className="px-4 py-3">Error</th>
              <th className="px-4 py-3">Responsable</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Plazo</th>
              <th className="px-4 py-3">Resolución</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">No hay incidencias con esos filtros.</td>
              </tr>
            )}
            {filtradas.map((i) => {
              const vencida = i.fecha_limite && i.fecha_limite < hoy && incidenciaAbierta(i.estado);
              return (
                <tr key={i.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-xs">{fechaHora(i.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-500">{MODULO[i.origen_tipo] ?? i.origen_tipo}</span>
                    <div>
                      {i.ruta ? (
                        <Link href={i.ruta} className="font-mono text-emerald-700 hover:underline">{i.referencia ?? "Abrir"}</Link>
                      ) : (
                        i.referencia ?? "—"
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold text-slate-600">{TIPO_INCIDENCIA_LABEL[i.tipo] ?? i.tipo}</span>
                    <p className="text-slate-800">{i.descripcion}</p>
                  </td>
                  <td className="px-4 py-3">{i.responsable_nombre ?? <span className="text-rose-600">Sin asignar</span>}</td>
                  <td className="px-4 py-3 text-xs font-semibold">{ESTADO_INCIDENCIA_LABEL[i.estado]}</td>
                  <td className={`px-4 py-3 whitespace-nowrap text-xs ${vencida ? "font-semibold text-rose-600" : ""}`}>{i.fecha_limite ? `${fechaES(i.fecha_limite)}${vencida ? " · vencida" : ""}` : "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {i.accion_correctiva ?? "—"}
                    {i.resuelto_at && <div className="text-[11px] text-slate-400">Resuelta {fechaHora(i.resuelto_at)}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Para gestionar una incidencia (asignar, resolver, verificar), abrí su operación y entrá a la pestaña Incidencias.</p>
    </div>
  );
}

export default function RegistroIncidenciasPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
      <Registro />
    </Suspense>
  );
}
