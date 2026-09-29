"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { ESTADO_CONTENEDOR_LABEL, ESTADO_EXPORTACION_LABEL, ESTADO_IMPORTACION_LABEL, TIPO_INCIDENCIA_LABEL } from "@/lib/comex/estados";
import { Aviso, api, fechaES, hoyPY, inputClass, labelClass } from "@/components/comex/ui";

type Conteo = { clave: string; cantidad: number };
type Reporte = {
  desde: string;
  hasta: string;
  operaciones: {
    importaciones: { total: number; por_estado: Conteo[]; abiertas: number };
    exportaciones: { total: number; por_estado: Conteo[]; atrasadas: { id: string; numero: string; cliente: string; comprometida: string; dias: number }[]; embarcadas_tarde: number };
    contenedores: Conteo[];
  };
  inventario: { conteos: number; ajustados: number; productos_contados: number; con_diferencia: number; faltante: number; sobrante: number; mayor_variacion: { producto: string; diferencia: number; conteo: string }[] };
  proveedores: { proveedor: string; compromisos: number; entregas: number; a_tiempo: number; demoradas: number; cumplimiento: number | null; demora_promedio_dias: number; documentacion_completa: number | null; incidentes: number }[];
  qa: { total: number; abiertas: number; vencidas: number; resolucion_promedio_horas: number | null; por_tipo: Conteo[]; por_prioridad: Conteo[]; por_modulo: Conteo[] };
};

const ETIQ: Record<string, string> = { ...ESTADO_IMPORTACION_LABEL, ...ESTADO_EXPORTACION_LABEL, ...ESTADO_CONTENEDOR_LABEL };
const MODULO: Record<string, string> = { IMPORTACION: "Importaciones", EXPORTACION: "Exportaciones", CONTENEDOR: "Contenedores", CONTEO: "Inventario físico", COMPROMISO: "Proveedores" };

function Tarjeta({ titulo, valor, detalle, alerta }: { titulo: string; valor: string | number; detalle?: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-semibold ${alerta ? "text-rose-600" : "text-slate-900"}`}>{valor}</p>
      {detalle && <p className="text-xs text-slate-500">{detalle}</p>}
    </div>
  );
}

function Barras({ datos, etiqueta }: { datos: Conteo[]; etiqueta?: (k: string) => string }) {
  const max = Math.max(1, ...datos.map((d) => d.cantidad));
  if (!datos.length) return <p className="text-sm text-slate-500">Sin datos en el período.</p>;
  return (
    <div className="space-y-1.5">
      {datos.map((d) => (
        <div key={d.clave} className="flex items-center gap-3 text-sm">
          <span className="w-40 shrink-0 truncate text-slate-600">{etiqueta ? etiqueta(d.clave) : d.clave}</span>
          <div className="h-2.5 flex-1 rounded bg-slate-100">
            <div className="h-2.5 rounded bg-emerald-500" style={{ width: `${(d.cantidad / max) * 100}%` }} />
          </div>
          <span className="w-8 text-right font-medium tabular-nums">{d.cantidad}</span>
        </div>
      ))}
    </div>
  );
}

/** Reportes de Comercio Exterior (PDF §9): operaciones, inventario, proveedores y QA. */
export default function ReportesComexPage() {
  const hoy = hoyPY();
  const [desde, setDesde] = useState(`${hoy.slice(0, 4)}-01-01`);
  const [hasta, setHasta] = useState(hoy);
  const [r, setR] = useState<Reporte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"operaciones" | "inventario" | "proveedores" | "qa">("operaciones");

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setR(await api<Reporte>(`/api/comex/reportes?desde=${desde}&hasta=${hasta}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [desde, hasta]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Comercio exterior</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <BarChart3 className="h-6 w-6 text-slate-500" /> Reportes
          </h1>
          <p className="text-sm text-slate-600">Todo sale de lo cargado en el sistema, para el período elegido.</p>
        </div>
        <div className="flex gap-2">
          <div>
            <label className={labelClass}>Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputClass} />
          </div>
        </div>
      </header>
      {error && <Aviso>{error}</Aviso>}
      <nav className="flex gap-1 border-b border-slate-200">
        {(
          [
            ["operaciones", "Operaciones"],
            ["inventario", "Inventario físico"],
            ["proveedores", "Proveedores"],
            ["qa", "Errores y QA"],
          ] as const
        ).map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500"}`}>
            {t}
          </button>
        ))}
      </nav>
      {!r ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : tab === "operaciones" ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <Tarjeta titulo="Importaciones" valor={r.operaciones.importaciones.total} detalle={`${r.operaciones.importaciones.abiertas} abiertas`} />
            <Tarjeta titulo="Exportaciones" valor={r.operaciones.exportaciones.total} />
            <Tarjeta titulo="Embarques atrasados" valor={r.operaciones.exportaciones.atrasadas.length} alerta={r.operaciones.exportaciones.atrasadas.length > 0} />
            <Tarjeta titulo="Embarcadas con demora" valor={r.operaciones.exportaciones.embarcadas_tarde} />
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Importaciones por estado</h3>
              <Barras datos={r.operaciones.importaciones.por_estado} etiqueta={(k) => ETIQ[k] ?? k} />
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Exportaciones por estado</h3>
              <Barras datos={r.operaciones.exportaciones.por_estado} etiqueta={(k) => ETIQ[k] ?? k} />
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Contenedores por estado (todos)</h3>
              <Barras datos={r.operaciones.contenedores} etiqueta={(k) => ETIQ[k] ?? k} />
            </section>
          </div>
          {r.operaciones.exportaciones.atrasadas.length > 0 && (
            <section className="rounded-xl border border-rose-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-rose-700">Exportaciones que pasaron la fecha de embarque</h3>
              {r.operaciones.exportaciones.atrasadas.map((e) => (
                <p key={e.id} className="text-sm">
                  <Link href={`/exportaciones/${e.id}`} className="font-mono text-emerald-700 hover:underline">{e.numero}</Link> · {e.cliente} · comprometida {fechaES(e.comprometida)} ({e.dias} días)
                </p>
              ))}
            </section>
          )}
        </div>
      ) : tab === "inventario" ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <Tarjeta titulo="Conteos" valor={r.inventario.conteos} detalle={`${r.inventario.ajustados} ajustados`} />
            <Tarjeta titulo="Productos contados" valor={r.inventario.productos_contados} />
            <Tarjeta titulo="Con diferencia" valor={r.inventario.con_diferencia} detalle={r.inventario.productos_contados ? `${Math.round((r.inventario.con_diferencia / r.inventario.productos_contados) * 100)}% de lo contado` : undefined} alerta={r.inventario.con_diferencia > 0} />
            <Tarjeta titulo="Faltante / sobrante" valor={`−${r.inventario.faltante} / +${r.inventario.sobrante}`} detalle="unidades" />
          </div>
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Productos con mayor variación</h3>
            {r.inventario.mayor_variacion.length === 0 ? (
              <p className="text-sm text-slate-500">Sin diferencias en el período.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {r.inventario.mayor_variacion.map((v, i) => (
                    <tr key={i} className="border-t border-slate-100 first:border-t-0">
                      <td className="py-1.5">{v.producto}</td>
                      <td className="py-1.5 font-mono text-xs text-slate-500">{v.conteo}</td>
                      <td className={`py-1.5 text-right font-semibold ${v.diferencia > 0 ? "text-emerald-700" : "text-rose-700"}`}>{v.diferencia > 0 ? `+${v.diferencia}` : v.diferencia}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      ) : tab === "proveedores" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3 text-right">Compromisos</th>
                <th className="px-4 py-3 text-right">Entregas</th>
                <th className="px-4 py-3 text-right">A tiempo</th>
                <th className="px-4 py-3 text-right">Demoradas</th>
                <th className="px-4 py-3 text-right">Cumplimiento</th>
                <th className="px-4 py-3 text-right">Demora prom.</th>
                <th className="px-4 py-3 text-right">Doc. completa</th>
                <th className="px-4 py-3 text-right">Incidentes</th>
              </tr>
            </thead>
            <tbody>
              {r.proveedores.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">Sin compromisos ni incidentes en el período.</td>
                </tr>
              )}
              {r.proveedores.map((p) => (
                <tr key={p.proveedor} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium">{p.proveedor}</td>
                  <td className="px-4 py-2.5 text-right">{p.compromisos}</td>
                  <td className="px-4 py-2.5 text-right">{p.entregas}</td>
                  <td className="px-4 py-2.5 text-right">{p.a_tiempo}</td>
                  <td className={`px-4 py-2.5 text-right ${p.demoradas ? "font-semibold text-rose-700" : ""}`}>{p.demoradas}</td>
                  <td className="px-4 py-2.5 text-right">{p.cumplimiento === null ? "—" : `${p.cumplimiento}%`}</td>
                  <td className="px-4 py-2.5 text-right">{p.demora_promedio_dias ? `${p.demora_promedio_dias} días` : "—"}</td>
                  <td className="px-4 py-2.5 text-right">{p.documentacion_completa === null ? "—" : `${p.documentacion_completa}%`}</td>
                  <td className={`px-4 py-2.5 text-right ${p.incidentes ? "font-semibold text-amber-700" : ""}`}>{p.incidentes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <Tarjeta titulo="Incidencias" valor={r.qa.total} />
            <Tarjeta titulo="Sin resolver" valor={r.qa.abiertas} alerta={r.qa.abiertas > 0} />
            <Tarjeta titulo="Con plazo vencido" valor={r.qa.vencidas} alerta={r.qa.vencidas > 0} />
            <Tarjeta
              titulo="Tiempo promedio de resolución"
              valor={r.qa.resolucion_promedio_horas === null ? "—" : r.qa.resolucion_promedio_horas < 48 ? `${r.qa.resolucion_promedio_horas} h` : `${Math.round(r.qa.resolucion_promedio_horas / 24)} días`}
            />
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Errores más frecuentes</h3>
              <Barras datos={r.qa.por_tipo} etiqueta={(k) => TIPO_INCIDENCIA_LABEL[k] ?? k} />
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Por módulo</h3>
              <Barras datos={r.qa.por_modulo} etiqueta={(k) => MODULO[k] ?? k} />
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Por prioridad</h3>
              <Barras datos={r.qa.por_prioridad} />
            </section>
          </div>
          <Link href="/comex/incidencias?estado=todas" className="text-sm font-medium text-emerald-700 hover:underline">
            Ver el registro completo de incidencias →
          </Link>
        </div>
      )}
    </div>
  );
}
