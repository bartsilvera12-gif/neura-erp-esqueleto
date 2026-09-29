"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import ProductoBuscador from "@/app/importaciones/_components/ProductoBuscador";
import HistorialPanel from "@/components/comex/HistorialPanel";
import IncidenciasPanel from "@/components/comex/IncidenciasPanel";
import { Aviso, ModalShell, api, btnPrimario, btnSecundario, fechaHora, inputClass, jsonInit, labelClass, noRueda, sinFlechas } from "@/components/comex/ui";

type Item = {
  id: string;
  producto_id: string | null;
  producto_nombre: string;
  sku: string | null;
  stock_sistema: number;
  cantidad_fisica: number | null;
  motivo: string | null;
  contado_por_nombre: string | null;
  contado_at: string | null;
  ajustado: boolean;
};
type Conteo = {
  id: string;
  numero: string;
  ubicacion_nombre: string | null;
  pais: string | null;
  sector: string | null;
  categoria_nombre: string | null;
  responsable_nombre: string;
  estado: "en_curso" | "cerrado" | "ajustado" | "anulado";
  observaciones: string | null;
  cerrado_at: string | null;
  ajustado_at: string | null;
  ajustado_por_nombre: string | null;
  created_at: string;
};

/** Planilla de conteo: se carga lo contado; la diferencia la calcula el sistema. */
export default function ConteoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isAdmin } = useIsAdmin();
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [editados, setEditados] = useState<Record<string, { cantidad_fisica: string; motivo: string }>>({});
  const [filtro, setFiltro] = useState<"todos" | "pendientes" | "diferencias">("todos");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [accion, setAccion] = useState<"reabrir" | "anular" | "ajustar" | null>(null);
  const [agregar, setAgregar] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [tab, setTab] = useState<"planilla" | "incidencias" | "historial">("planilla");

  const cargar = useCallback(async () => {
    try {
      const d = await api<{ conteo: Conteo; items: Item[] }>(`/api/comex/conteos/${id}`);
      setConteo(d.conteo);
      setItems(d.items);
      setEditados({});
      setRecarga((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [id]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const val = (it: Item) => editados[it.id] ?? { cantidad_fisica: it.cantidad_fisica === null ? "" : String(it.cantidad_fisica), motivo: it.motivo ?? "" };
  const dif = (it: Item) => {
    const v = val(it).cantidad_fisica;
    return v === "" ? null : Number(v) - Number(it.stock_sistema);
  };
  const lista = useMemo(
    () =>
      items.filter((it) => {
        if (q && !`${it.producto_nombre} ${it.sku ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
        if (filtro === "pendientes") return val(it).cantidad_fisica === "";
        if (filtro === "diferencias") return (dif(it) ?? 0) !== 0;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, editados, filtro, q]
  );
  const contados = items.filter((it) => val(it).cantidad_fisica !== "").length;
  const conDif = items.filter((it) => (dif(it) ?? 0) !== 0).length;
  const hayCambios = Object.keys(editados).length > 0;
  const enCurso = conteo?.estado === "en_curso";

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await api(`/api/comex/conteos/${id}/items`, jsonInit("PATCH", { items: Object.entries(editados).map(([iid, v]) => ({ id: iid, ...v })) }));
      setAviso("Cantidades guardadas.");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setGuardando(false);
    }
  }

  async function cerrar() {
    setError(null);
    try {
      if (hayCambios) await api(`/api/comex/conteos/${id}/items`, jsonInit("PATCH", { items: Object.entries(editados).map(([iid, v]) => ({ id: iid, ...v })) }));
      await api(`/api/comex/conteos/${id}/estado`, jsonInit("POST", { accion: "cerrar" }));
      setAviso("Conteo cerrado. Si hay diferencias, un administrador puede ajustar el stock.");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      await cargar();
    }
  }

  if (!conteo) return <p className="text-sm text-slate-500">{error ?? "Cargando…"}</p>;

  return (
    <div className="space-y-5">
      <Link href="/comex/inventario-fisico" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Inventario físico
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Conteo físico</p>
          <h1 className="text-2xl font-semibold text-slate-900">
            <span className="font-mono">{conteo.numero}</span> — {conteo.ubicacion_nombre}
          </h1>
          <p className="text-sm text-slate-600">
            {[conteo.sector, conteo.categoria_nombre, `Responsable ${conteo.responsable_nombre}`, `Abierto el ${fechaHora(conteo.created_at)}`].filter(Boolean).join(" · ")}
          </p>
          {conteo.ajustado_at && <p className="text-xs text-emerald-700">Stock ajustado por {conteo.ajustado_por_nombre} el {fechaHora(conteo.ajustado_at)}</p>}
        </div>
        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs text-slate-500">Productos</p>
            <p className="font-semibold">{items.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs text-slate-500">Contados</p>
            <p className="font-semibold">{contados}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs text-slate-500">Con diferencia</p>
            <p className={`font-semibold ${conDif ? "text-rose-700" : ""}`}>{conDif}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {enCurso && (
          <>
            <button onClick={() => void guardar()} disabled={!hayCambios || guardando} className={btnPrimario}>
              {guardando ? "Guardando…" : "Guardar cantidades"}
            </button>
            <button onClick={() => setAgregar(true)} className={btnSecundario}>Agregar producto encontrado</button>
            <button onClick={() => void cerrar()} className={btnSecundario}>Terminar conteo</button>
          </>
        )}
        {conteo.estado === "cerrado" && (
          <>
            {isAdmin && (
              <button onClick={() => setAccion("ajustar")} className={btnPrimario}>
                Ajustar el stock a lo contado
              </button>
            )}
            <button onClick={() => setAccion("reabrir")} className={btnSecundario}>Reabrir</button>
          </>
        )}
        {isAdmin && conteo.estado !== "ajustado" && conteo.estado !== "anulado" && (
          <button onClick={() => setAccion("anular")} className={`${btnSecundario} text-rose-600`}>Anular</button>
        )}
      </div>
      {conteo.estado === "cerrado" && !isAdmin && <Aviso tipo="info">El conteo está cerrado. El ajuste del stock lo hace un administrador.</Aviso>}
      {error && <Aviso>{error}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

      <nav className="flex gap-1 border-b border-slate-200">
        {(["planilla", "incidencias", "historial"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500"}`}>
            {t === "planilla" ? "Planilla" : t === "incidencias" ? "Incidencias" : "Historial"}
          </button>
        ))}
      </nav>

      {tab === "planilla" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o código" className={`${inputClass} max-w-xs`} />
            {(["todos", "pendientes", "diferencias"] as const).map((f) => (
              <button key={f} onClick={() => setFiltro(f)} className={`rounded-full px-3 py-1 text-xs font-medium ${filtro === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>
                {f === "todos" ? "Todos" : f === "pendientes" ? "Sin contar" : "Con diferencia"}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3 text-right">Sistema</th>
                  <th className="px-4 py-3 text-right">Contado</th>
                  <th className="px-4 py-3 text-right">Diferencia</th>
                  <th className="px-4 py-3">Motivo de la diferencia</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((it) => {
                  const v = val(it);
                  const d = dif(it);
                  return (
                    <tr key={it.id} className="border-t border-slate-100">
                      <td className="px-4 py-2">
                        <div className="font-medium text-slate-900">{it.producto_nombre}</div>
                        <div className="text-[11px] text-slate-400">
                          {it.sku ?? ""}
                          {it.contado_por_nombre && ` · contó ${it.contado_por_nombre}`}
                          {it.ajustado && " · ajustado"}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600">{Number(it.stock_sistema).toLocaleString("es-PY")}</td>
                      <td className="px-4 py-2 text-right">
                        {enCurso ? (
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={v.cantidad_fisica}
                            onWheel={noRueda}
                            onChange={(e) => setEditados({ ...editados, [it.id]: { ...v, cantidad_fisica: e.target.value } })}
                            className={`${sinFlechas} ml-auto block w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-emerald-400`}
                          />
                        ) : (
                          (it.cantidad_fisica ?? "—").toLocaleString()
                        )}
                      </td>
                      <td className={`px-4 py-2 text-right font-semibold ${d === null ? "text-slate-300" : d === 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {d === null ? "—" : d === 0 ? "0" : `${d > 0 ? "+" : ""}${d.toLocaleString("es-PY")}`}
                      </td>
                      <td className="px-4 py-2">
                        {enCurso && d !== null && d !== 0 ? (
                          <input
                            value={v.motivo}
                            onChange={(e) => setEditados({ ...editados, [it.id]: { ...v, motivo: e.target.value } })}
                            placeholder="Ej.: rotura, venta sin descargar…"
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-400"
                          />
                        ) : (
                          <span className="text-xs text-slate-600">{it.motivo ?? ""}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "incidencias" && <IncidenciasPanel origenTipo="CONTEO" origenId={id} bloqueado={conteo.estado === "anulado"} />}
      {tab === "historial" && <HistorialPanel origenTipo="CONTEO" origenId={id} recarga={recarga} />}

      {agregar && (
        <ModalShell title="Agregar producto encontrado" onClose={() => setAgregar(false)}>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Para un producto que apareció en el depósito y no estaba en la lista.</p>
            <ProductoBuscador
              valor={null}
              autoFocus
              onElegir={async (p) => {
                try {
                  await api(`/api/comex/conteos/${id}/items`, jsonInit("POST", { producto_id: p.id }));
                  setAgregar(false);
                  await cargar();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Error");
                  setAgregar(false);
                }
              }}
            />
          </div>
        </ModalShell>
      )}
      {accion && (
        <ModalAccion
          accion={accion}
          conDif={items.filter((i) => Number(i.cantidad_fisica) !== Number(i.stock_sistema) && i.cantidad_fisica !== null)}
          onClose={() => setAccion(null)}
          onConfirm={async (motivo) => {
            await api(`/api/comex/conteos/${id}/estado`, jsonInit("POST", { accion, motivo }));
            setAccion(null);
            setAviso(accion === "ajustar" ? "Stock ajustado. Cada ajuste quedó en Movimientos de inventario y en el Historial." : accion === "reabrir" ? "Conteo reabierto." : "Conteo anulado.");
            await cargar();
          }}
        />
      )}
    </div>
  );
}

function ModalAccion({
  accion,
  conDif,
  onClose,
  onConfirm,
}: {
  accion: "reabrir" | "anular" | "ajustar";
  conDif: Item[];
  onClose: () => void;
  onConfirm: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titulo = accion === "ajustar" ? "Ajustar el stock a lo contado" : accion === "reabrir" ? "Reabrir conteo" : "Anular conteo";
  return (
    <ModalShell title={titulo} onClose={onClose} ancho={accion === "ajustar" ? "max-w-2xl" : "max-w-lg"}>
      <div className="space-y-4">
        {accion === "ajustar" ? (
          conDif.length === 0 ? (
            <p className="text-sm text-slate-600">No hay diferencias: el conteo queda como ajustado sin tocar el stock.</p>
          ) : (
            <>
              <p className="text-sm text-slate-600">Se va a cambiar el stock de {conDif.length} producto(s). Queda registrado con tu usuario:</p>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 text-sm">
                {conDif.map((i) => {
                  const d = Number(i.cantidad_fisica) - Number(i.stock_sistema);
                  return (
                    <div key={i.id} className="flex justify-between gap-3 border-t border-slate-100 px-3 py-1.5 first:border-t-0">
                      <span>
                        {i.producto_nombre}
                        <span className="block text-[11px] text-slate-400">{i.motivo ?? "Sin motivo"}</span>
                      </span>
                      <span className={`font-semibold ${d > 0 ? "text-emerald-700" : "text-rose-700"}`}>{d > 0 ? `+${d}` : d}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )
        ) : (
          <div>
            <label className={labelClass}>Motivo *</label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputClass} autoFocus />
          </div>
        )}
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnSecundario}>Cancelar</button>
          <button
            disabled={saving || (accion !== "ajustar" && !motivo.trim())}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await onConfirm(motivo);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Error");
                setSaving(false);
              }
            }}
            className={accion === "anular" ? "inline-flex items-center rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50" : btnPrimario}
          >
            {saving ? "Procesando…" : accion === "ajustar" ? "Ajustar stock" : "Confirmar"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
