"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import type { EstadoImportacion, Importacion, ImportacionItem, ImportacionRecepcion } from "@/lib/importaciones/types";
import type { Contenedor, Incidencia } from "@/lib/comex/types";
import { ESTADO_IMPORTACION_LABEL, FLUJO_IMPORTACION, anteriorImportacion, incidenciaAbierta } from "@/lib/comex/estados";
import { Aviso, ModalShell, api, btnPrimario, btnSecundario, fechaHora, inputClass, jsonInit, labelClass } from "@/components/comex/ui";
import IncidenciasPanel from "@/components/comex/IncidenciasPanel";
import AdjuntosPanel from "@/components/comex/AdjuntosPanel";
import HistorialPanel from "@/components/comex/HistorialPanel";
import ContenedoresPanel from "@/components/comex/ContenedoresPanel";
import FichaForm, { fichaAPayload, type Ficha } from "../_components/FichaForm";
import MercaderiaTab from "./_components/MercaderiaTab";
import RecepcionTab from "./_components/RecepcionTab";

type Tab = "datos" | "mercaderia" | "contenedores" | "recepcion" | "incidencias" | "documentos" | "historial";

const aFicha = (i: Importacion): Ficha => ({
  proveedor_id: i.proveedor_id,
  proveedor_nombre: i.proveedor_nombre ?? "",
  pais_origen: i.pais_origen ?? "",
  fecha_pedido: i.fecha_pedido ?? "",
  fecha_embarque: i.fecha_embarque ?? "",
  fecha_arribo: i.fecha_arribo ?? "",
  fecha_nacionalizacion: i.fecha_nacionalizacion ?? "",
  ubicacion_destino_py_id: i.ubicacion_destino_py_id ?? "",
  responsable_id: i.responsable_id,
  responsable_nombre: i.responsable_nombre,
  observaciones: i.observaciones ?? "",
});

export default function ImportacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isAdmin } = useIsAdmin();
  const [imp, setImp] = useState<Importacion | null>(null);
  const [siguiente, setSiguiente] = useState<EstadoImportacion | null>(null);
  const [faltantes, setFaltantes] = useState<string[]>([]);
  const [items, setItems] = useState<ImportacionItem[]>([]);
  const [contenedores, setContenedores] = useState<Contenedor[]>([]);
  const [recepciones, setRecepciones] = useState<ImportacionRecepcion[]>([]);
  const [incAbiertas, setIncAbiertas] = useState(0);
  const [tab, setTab] = useState<Tab>("datos");
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const fichaServidor = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [recargaHist, setRecargaHist] = useState(0);
  const [modalMotivo, setModalMotivo] = useState<{ estado: EstadoImportacion; titulo: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, it, co, re, inc] = await Promise.all([
        api<{ importacion: Importacion; siguiente: EstadoImportacion | null; faltantes: string[] }>(`/api/importaciones/${id}`),
        api<{ items: ImportacionItem[] }>(`/api/importaciones/${id}/items`),
        api<{ contenedores: Contenedor[] }>(`/api/importaciones/${id}/contenedores`),
        api<{ recepciones: ImportacionRecepcion[] }>(`/api/importaciones/${id}/recepciones`),
        api<{ incidencias: Incidencia[] }>(`/api/comex/incidencias?origen_tipo=IMPORTACION&origen_id=${id}`),
      ]);
      setImp(d.importacion);
      // Si hay cambios sin guardar en Datos, no se pisan al recargar por otra pestaña.
      const nueva = aFicha(d.importacion);
      setFicha((actual) => (actual === null || JSON.stringify(actual) === fichaServidor.current ? nueva : actual));
      fichaServidor.current = JSON.stringify(nueva);
      setSiguiente(d.siguiente);
      setFaltantes(d.faltantes);
      setItems(it.items);
      setContenedores(co.contenedores);
      setRecepciones(re.recepciones);
      setIncAbiertas(inc.incidencias.filter((i) => incidenciaAbierta(i.estado)).length);
      setRecargaHist((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!imp || !ficha) {
    return (
      <div className="space-y-4">
        <Link href="/importaciones" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Importaciones
        </Link>
        {error ? <Aviso>{error}</Aviso> : <p className="text-sm text-slate-500">Cargando…</p>}
      </div>
    );
  }

  const bloqueada = imp.estado === "cerrada" || imp.estado === "anulada";
  const anterior = anteriorImportacion(imp.estado);
  const idxEstado = FLUJO_IMPORTACION.indexOf(imp.estado);
  const fichaCambiada = JSON.stringify(ficha) !== JSON.stringify(aFicha(imp));

  async function cambiarEstado(estado: EstadoImportacion, motivo?: string) {
    setError(null);
    setAviso(null);
    try {
      await api(`/api/importaciones/${id}/estado`, jsonInit("POST", { estado, motivo }));
      setAviso(`La importación pasó a "${ESTADO_IMPORTACION_LABEL[estado]}".`);
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
      await api(`/api/importaciones/${id}`, jsonInit("PATCH", fichaAPayload(ficha)));
      setAviso("Cambios guardados.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setGuardando(false);
    }
  }

  const TABS: { k: Tab; label: string; badge?: number }[] = [
    { k: "datos", label: "Datos" },
    { k: "mercaderia", label: "Mercadería", badge: items.length },
    { k: "contenedores", label: "Contenedores", badge: contenedores.length },
    { k: "recepcion", label: "Recepción" },
    { k: "incidencias", label: "Incidencias", badge: incAbiertas },
    { k: "documentos", label: "Documentos" },
    { k: "historial", label: "Historial" },
  ];

  return (
    <div className="space-y-5">
      <Link href="/importaciones" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Importaciones
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Comercio exterior</p>
          <h1 className="text-2xl font-semibold text-slate-900">
            <span className="font-mono">{imp.numero}</span> — {imp.proveedor_nombre ?? "—"}
          </h1>
          <p className="text-sm text-slate-600">
            Origen {imp.pais_origen || "—"} · Responsable {imp.responsable_nombre ?? "sin asignar"} · Creada por {imp.created_by_nombre ?? "—"} el{" "}
            {fechaHora(imp.created_at)}
          </p>
        </div>
      </header>

      {/* Estado */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {imp.estado === "anulada" ? (
          <Aviso>
            <strong>Importación anulada.</strong> Motivo: {imp.anulada_motivo ?? "—"}
          </Aviso>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {FLUJO_IMPORTACION.map((e, k) => (
                <span
                  key={e}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    k < idxEstado ? "bg-emerald-50 text-emerald-700" : k === idxEstado ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {k <= idxEstado ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                  {ESTADO_IMPORTACION_LABEL[e]}
                </span>
              ))}
            </div>
            {siguiente && (
              <div className="mt-3">
                {faltantes.length > 0 ? (
                  <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p className="font-medium">Para pasar a “{ESTADO_IMPORTACION_LABEL[siguiente]}” falta:</p>
                    <ul className="mt-1 list-disc pl-5">
                      {faltantes.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-emerald-700">Todo listo para pasar a “{ESTADO_IMPORTACION_LABEL[siguiente]}”.</p>
                )}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {siguiente && (
                <button onClick={() => void cambiarEstado(siguiente)} disabled={faltantes.length > 0} className={btnPrimario}>
                  Pasar a {ESTADO_IMPORTACION_LABEL[siguiente]}
                </button>
              )}
              {anterior && (
                <button onClick={() => setModalMotivo({ estado: anterior, titulo: `Volver a ${ESTADO_IMPORTACION_LABEL[anterior]}` })} className={btnSecundario}>
                  Volver a {ESTADO_IMPORTACION_LABEL[anterior]}
                </button>
              )}
              {isAdmin && imp.estado !== "cerrada" && (
                <button onClick={() => setModalMotivo({ estado: "anulada", titulo: "Anular importación" })} className={`${btnSecundario} text-rose-600`}>
                  Anular
                </button>
              )}
            </div>
          </>
        )}
      </div>

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
              <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${t.k === "incidencias" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {tab === "datos" && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <FichaForm ficha={ficha} onChange={setFicha} bloqueado={bloqueada} />
          {!bloqueada && (
            <div className="flex justify-end gap-2">
              {fichaCambiada && (
                <button onClick={() => setFicha(aFicha(imp))} className={btnSecundario}>
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
      {tab === "mercaderia" && <MercaderiaTab imp={imp} items={items} contenedores={contenedores} onCambio={() => void load()} />}
      {tab === "contenedores" && (
        <ContenedoresPanel
          crearUrl={`/api/importaciones/${id}/contenedores`}
          contenedores={contenedores}
          items={items}
          bloqueado={bloqueada}
          onCambio={() => void load()}
        />
      )}
      {tab === "recepcion" && <RecepcionTab imp={imp} items={items} recepciones={recepciones} onCambio={() => void load()} />}
      {tab === "incidencias" && <IncidenciasPanel origenTipo="IMPORTACION" origenId={id} bloqueado={imp.estado === "anulada"} onCambio={() => void load()} />}
      {tab === "documentos" && <AdjuntosPanel origenTipo="IMPORTACION" origenId={id} bloqueado={imp.estado === "anulada"} />}
      {tab === "historial" && <HistorialPanel origenTipo="IMPORTACION" origenId={id} recarga={recargaHist} />}

      {modalMotivo && (
        <ModalMotivo
          titulo={modalMotivo.titulo}
          peligro={modalMotivo.estado === "anulada"}
          onClose={() => setModalMotivo(null)}
          onConfirm={(m) => cambiarEstado(modalMotivo.estado, m)}
        />
      )}
    </div>
  );
}

function ModalMotivo({
  titulo,
  peligro,
  onClose,
  onConfirm,
}: {
  titulo: string;
  peligro: boolean;
  onClose: () => void;
  onConfirm: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <ModalShell title={titulo} onClose={onClose}>
      <div className="space-y-4">
        {peligro && <p className="text-sm text-slate-600">La importación queda registrada como anulada con todo su historial. No se puede deshacer.</p>}
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
