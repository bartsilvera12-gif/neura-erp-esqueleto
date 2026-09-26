"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import type { EstadoExportacion, Exportacion, ExportacionItem, VinculoFactura, VinculoRemision } from "@/lib/exportaciones/types";
import type { Contenedor, Incidencia } from "@/lib/comex/types";
import { ESTADO_EXPORTACION_LABEL, FLUJO_EXPORTACION, anteriorExportacion, incidenciaAbierta } from "@/lib/comex/estados";
import { Aviso, ModalShell, api, btnPrimario, btnSecundario, fechaHora, inputClass, jsonInit, labelClass } from "@/components/comex/ui";
import IncidenciasPanel from "@/components/comex/IncidenciasPanel";
import AdjuntosPanel from "@/components/comex/AdjuntosPanel";
import HistorialPanel from "@/components/comex/HistorialPanel";
import ContenedoresPanel from "@/components/comex/ContenedoresPanel";
import ExpFichaForm, { expFichaAPayload, type ExpFicha } from "../_components/ExpFichaForm";
import VinculosCard from "./_components/VinculosCard";
import ProductosTab from "./_components/ProductosTab";
import ChecklistTab from "./_components/ChecklistTab";

type Tab = "datos" | "productos" | "contenedores" | "documentos" | "checklist" | "incidencias" | "historial";

const aFicha = (e: Exportacion): ExpFicha => ({
  cliente_id: e.cliente_id,
  cliente_nombre: e.cliente_nombre,
  pais_destino: e.pais_destino,
  productor: e.productor ?? "",
  responsable_id: e.responsable_id,
  responsable_nombre: e.responsable_nombre,
  fecha_comprometida_embarque: e.fecha_comprometida_embarque ?? "",
  fecha_comprometida_entrega: e.fecha_comprometida_entrega ?? "",
  fecha_embarque: e.fecha_embarque ?? "",
  fecha_entrega: e.fecha_entrega ?? "",
  observaciones: e.observaciones ?? "",
});

const ETIQUETA_AVANZAR: Partial<Record<EstadoExportacion, string>> = {
  documentacion: "Pasar a Documentación",
  aprobada: "Aprobar despacho",
  despachada: "Marcar despachada",
  entregada: "Marcar entregada",
  cerrada: "Cerrar exportación",
};

export default function ExportacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isAdmin } = useIsAdmin();
  const [exp, setExp] = useState<Exportacion | null>(null);
  const [siguiente, setSiguiente] = useState<EstadoExportacion | null>(null);
  const [faltantes, setFaltantes] = useState<string[]>([]);
  const [factura, setFactura] = useState<VinculoFactura | null>(null);
  const [remision, setRemision] = useState<VinculoRemision | null>(null);
  const [items, setItems] = useState<ExportacionItem[]>([]);
  const [contenedores, setContenedores] = useState<Contenedor[]>([]);
  const [incAbiertas, setIncAbiertas] = useState(0);
  const [tab, setTab] = useState<Tab>("datos");
  const [ficha, setFicha] = useState<ExpFicha | null>(null);
  const fichaServidor = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [recargaHist, setRecargaHist] = useState(0);
  const [modalMotivo, setModalMotivo] = useState<{ estado: EstadoExportacion; titulo: string } | null>(null);
  const [modalProforma, setModalProforma] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, it, co, inc] = await Promise.all([
        api<{ exportacion: Exportacion; siguiente: EstadoExportacion | null; faltantes: string[]; factura: VinculoFactura | null; remision: VinculoRemision | null }>(
          `/api/exportaciones/${id}`
        ),
        api<{ items: ExportacionItem[] }>(`/api/exportaciones/${id}/items`),
        api<{ contenedores: Contenedor[] }>(`/api/exportaciones/${id}/contenedores`),
        api<{ incidencias: Incidencia[] }>(`/api/comex/incidencias?origen_tipo=EXPORTACION&origen_id=${id}`),
      ]);
      setExp(d.exportacion);
      // Si hay cambios sin guardar en Datos, no se pisan al recargar por otra pestaña.
      const nueva = aFicha(d.exportacion);
      setFicha((actual) => (actual === null || JSON.stringify(actual) === fichaServidor.current ? nueva : actual));
      fichaServidor.current = JSON.stringify(nueva);
      setSiguiente(d.siguiente);
      setFaltantes(d.faltantes);
      setFactura(d.factura);
      setRemision(d.remision);
      setItems(it.items);
      setContenedores(co.contenedores);
      setIncAbiertas(inc.incidencias.filter((i) => incidenciaAbierta(i.estado)).length);
      setRecargaHist((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!exp || !ficha) {
    return (
      <div className="space-y-4">
        <Link href="/exportaciones" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Exportaciones
        </Link>
        {error ? <Aviso>{error}</Aviso> : <p className="text-sm text-slate-500">Cargando…</p>}
      </div>
    );
  }

  const bloqueada = exp.estado === "cerrada" || exp.estado === "anulada";
  const anterior = anteriorExportacion(exp.estado);
  const idxEstado = FLUJO_EXPORTACION.indexOf(exp.estado);
  const fichaCambiada = JSON.stringify(ficha) !== JSON.stringify(aFicha(exp));

  async function cambiarEstado(estado: EstadoExportacion, motivo?: string) {
    setError(null);
    setAviso(null);
    try {
      await api(`/api/exportaciones/${id}/estado`, jsonInit("POST", { estado, motivo }));
      setAviso(`La exportación pasó a "${ESTADO_EXPORTACION_LABEL[estado]}".`);
      setModalMotivo(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setModalMotivo(null);
    }
  }

  async function guardarFicha() {
    if (!ficha) return;
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      await api(`/api/exportaciones/${id}`, jsonInit("PATCH", expFichaAPayload(ficha)));
      setAviso("Cambios guardados.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setGuardando(false);
    }
  }

  const TABS: { k: Tab; label: string; badge?: number; alerta?: boolean }[] = [
    { k: "datos", label: "Datos" },
    { k: "productos", label: "Productos", badge: items.length },
    { k: "contenedores", label: "Contenedores", badge: contenedores.length },
    { k: "documentos", label: "Documentos" },
    { k: "checklist", label: "Control de despacho" },
    { k: "incidencias", label: "Incidencias", badge: incAbiertas, alerta: true },
    { k: "historial", label: "Historial" },
  ];

  return (
    <div className="space-y-5">
      <Link href="/exportaciones" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Exportaciones
      </Link>

      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Comercio exterior</p>
        <h1 className="text-2xl font-semibold text-slate-900">
          <span className="font-mono">{exp.numero}</span> — {exp.cliente_nombre}
        </h1>
        <p className="text-sm text-slate-600">
          Destino {exp.pais_destino} · Responsable {exp.responsable_nombre} · {exp.requiere_proforma ? "Lleva proforma" : `Sin proforma (${exp.motivo_sin_proforma ?? "—"})`} ·
          Creada por {exp.created_by_nombre ?? "—"} el {fechaHora(exp.created_at)}
        </p>
        {exp.aprobada_por_nombre && (
          <p className="text-xs text-emerald-700">
            Despacho aprobado por {exp.aprobada_por_nombre} el {fechaHora(exp.aprobada_at)}
          </p>
        )}
      </header>

      {/* Estado */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {exp.estado === "anulada" ? (
          <Aviso>
            <strong>Exportación anulada.</strong> Motivo: {exp.anulada_motivo ?? "—"}
          </Aviso>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {FLUJO_EXPORTACION.map((e, k) => (
                <span
                  key={e}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    k < idxEstado ? "bg-emerald-50 text-emerald-700" : k === idxEstado ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {k <= idxEstado ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                  {ESTADO_EXPORTACION_LABEL[e]}
                </span>
              ))}
            </div>
            {siguiente && (
              <div className="mt-3">
                {faltantes.length > 0 ? (
                  <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p className="font-medium">Para pasar a “{ESTADO_EXPORTACION_LABEL[siguiente]}” falta:</p>
                    <ul className="mt-1 list-disc pl-5">
                      {faltantes.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-emerald-700">Todo listo para pasar a “{ESTADO_EXPORTACION_LABEL[siguiente]}”.</p>
                )}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {siguiente && (
                <button onClick={() => void cambiarEstado(siguiente)} disabled={faltantes.length > 0} className={btnPrimario}>
                  {ETIQUETA_AVANZAR[siguiente] ?? `Pasar a ${ESTADO_EXPORTACION_LABEL[siguiente]}`}
                </button>
              )}
              {anterior && (
                <button onClick={() => setModalMotivo({ estado: anterior, titulo: `Volver a ${ESTADO_EXPORTACION_LABEL[anterior]}` })} className={btnSecundario}>
                  Volver a {ESTADO_EXPORTACION_LABEL[anterior]}
                </button>
              )}
              {isAdmin && exp.estado !== "cerrada" && (
                <button onClick={() => setModalMotivo({ estado: "anulada", titulo: "Anular exportación" })} className={`${btnSecundario} text-rose-600`}>
                  Anular
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <VinculosCard exp={exp} factura={factura} remision={remision} onCambio={() => void load()} />

      {error && <Aviso>{error}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.k ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
            {!!t.badge && (
              <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${t.alerta ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{t.badge}</span>
            )}
          </button>
        ))}
      </nav>

      {tab === "datos" && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <ExpFichaForm ficha={ficha} onChange={setFicha} bloqueado={bloqueada} />
          {!bloqueada && (
            <div className="flex justify-end gap-2">
              {fichaCambiada && (
                <button onClick={() => setFicha(aFicha(exp))} className={btnSecundario}>
                  Descartar cambios
                </button>
              )}
              <button onClick={() => void guardarFicha()} disabled={guardando || !fichaCambiada} className={btnPrimario}>
                {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          )}
        </section>
      )}
      {tab === "productos" && <ProductosTab exp={exp} items={items} contenedores={contenedores} onCambio={() => void load()} />}
      {tab === "contenedores" && (
        <ContenedoresPanel crearUrl={`/api/exportaciones/${id}/contenedores`} contenedores={contenedores} items={items} bloqueado={bloqueada} onCambio={() => void load()} />
      )}
      {tab === "documentos" && (
        <div className="space-y-3">
          <div className={`rounded-xl border p-4 text-sm ${exp.requiere_proforma ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
            {exp.requiere_proforma ? (
              <p>
                <strong>Esta operación lleva proforma.</strong> Adjuntala eligiendo el tipo “Proforma”; sin ella no se puede aprobar el despacho.
              </p>
            ) : (
              <p>
                <strong>Esta operación no lleva proforma.</strong> Motivo: {exp.motivo_sin_proforma ?? "—"}
              </p>
            )}
            {isAdmin && (exp.estado === "preparacion" || exp.estado === "documentacion") && (
              <button onClick={() => setModalProforma(true)} className="mt-2 text-xs font-medium underline">
                {exp.requiere_proforma ? "Marcar que no lleva proforma (ej.: Sarasota)" : "Volver a exigir proforma"}
              </button>
            )}
          </div>
          <AdjuntosPanel origenTipo="EXPORTACION" origenId={id} bloqueado={exp.estado === "anulada"} />
        </div>
      )}
      {tab === "checklist" && <ChecklistTab exp={exp} onCambio={() => void load()} />}
      {tab === "incidencias" && <IncidenciasPanel origenTipo="EXPORTACION" origenId={id} bloqueado={exp.estado === "anulada"} onCambio={() => void load()} />}
      {tab === "historial" && <HistorialPanel origenTipo="EXPORTACION" origenId={id} recarga={recargaHist} />}

      {modalMotivo && (
        <ModalMotivo
          titulo={modalMotivo.titulo}
          peligro={modalMotivo.estado === "anulada"}
          onClose={() => setModalMotivo(null)}
          onConfirm={(m) => cambiarEstado(modalMotivo.estado, m)}
        />
      )}
      {modalProforma && (
        <ModalProforma
          exp={exp}
          onClose={() => setModalProforma(false)}
          onSaved={() => {
            setModalProforma(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ModalMotivo({ titulo, peligro, onClose, onConfirm }: { titulo: string; peligro: boolean; onClose: () => void; onConfirm: (motivo: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <ModalShell title={titulo} onClose={onClose}>
      <div className="space-y-4">
        {peligro && <p className="text-sm text-slate-600">La exportación queda registrada como anulada con todo su historial. No se puede deshacer.</p>}
        <div>
          <label className={labelClass}>Motivo *</label>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className={inputClass} autoFocus />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnSecundario}>
            Cancelar
          </button>
          <button
            disabled={saving || !motivo.trim()}
            onClick={async () => {
              setSaving(true);
              await onConfirm(motivo.trim());
              setSaving(false);
            }}
            className={peligro ? "inline-flex items-center rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50" : btnPrimario}
          >
            {peligro ? "Anular" : "Confirmar"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalProforma({ exp, onClose, onSaved }: { exp: Exportacion; onClose: () => void; onSaved: () => void }) {
  const quitar = exp.requiere_proforma;
  const [motivo, setMotivo] = useState("Contenedor Sarasota");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function guardar() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/exportaciones/${exp.id}`, jsonInit("PATCH", { requiere_proforma: !quitar, motivo_sin_proforma: quitar ? motivo : null }));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  }
  return (
    <ModalShell title={quitar ? "No lleva proforma" : "Exigir proforma"} onClose={onClose}>
      <div className="space-y-4">
        {quitar ? (
          <div>
            <label className={labelClass}>Motivo *</label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputClass} autoFocus />
            <p className="mt-1 text-xs text-slate-500">Queda registrado en el historial con tu usuario.</p>
          </div>
        ) : (
          <p className="text-sm text-slate-600">Para aprobar el despacho va a hacer falta adjuntar la proforma.</p>
        )}
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnSecundario}>
            Cancelar
          </button>
          <button onClick={() => void guardar()} disabled={saving || (quitar && !motivo.trim())} className={btnPrimario}>
            Confirmar
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
