"use client";

import { useState } from "react";
import { PackageCheck } from "lucide-react";
import ConfirmModal from "@/components/ui/ConfirmModal";
import type { Importacion, ImportacionItem, ImportacionRecepcion } from "@/lib/importaciones/types";
import { Aviso, api, btnPrimario, hoyPY, fechaES, fechaHora, inputClass, jsonInit, labelClass, noRueda, sinFlechas } from "@/components/comex/ui";

const cant = (v: number) => Number(v).toLocaleString("es-PY");
const PUEDE_RECIBIR = new Set(["arribado", "nacionalizada", "entregada"]);

export default function RecepcionTab({
  imp,
  items,
  recepciones,
  onCambio,
}: {
  imp: Importacion;
  items: ImportacionItem[];
  recepciones: ImportacionRecepcion[];
  onCambio: () => void;
}) {
  const terminada = recepciones.some((r) => r.final);
  const habilitada = PUEDE_RECIBIR.has(imp.estado) && !terminada;
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [fecha, setFecha] = useState(hoyPY);
  const [obs, setObs] = useState("");
  const [final, setFinal] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string[] | null>(null);
  const nombre = new Map(items.map((i) => [i.id, i.producto_nombre]));

  // Vista previa de diferencias antes de confirmar.
  const previa = items
    .map((i) => {
      const nuevo = Number(cantidades[i.id]) || 0;
      const total = Number(i.cantidad_recibida) + nuevo;
      const dif = total - Number(i.cantidad);
      return { i, nuevo, total, dif };
    })
    // Igual que el servidor: el sobrante se avisa solo si lo causa esta carga.
    .filter((x) => (x.dif > 0 && x.nuevo > 0) || (final && x.dif < 0));

  function completarTodo() {
    setCantidades(Object.fromEntries(items.map((i) => [i.id, String(Math.max(0, Number(i.cantidad) - Number(i.cantidad_recibida)))])));
  }

  async function registrar() {
    setSaving(true);
    setError(null);
    try {
      const d = await api<{ diferencias: string[] }>(
        `/api/importaciones/${imp.id}/recepciones`,
        jsonInit("POST", {
          fecha,
          final,
          observacion: obs,
          ubicacion_id: imp.ubicacion_destino_py_id,
          items: items.map((i) => ({ item_id: i.id, cantidad: Number(cantidades[i.id]) || 0 })),
        })
      );
      setResultado(d.diferencias);
      setCantidades({});
      setObs("");
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
      setConfirmar(false);
    }
  }

  const hayAlgo = Object.values(cantidades).some((v) => Number(v) > 0);

  return (
    <section className="space-y-4">
      {!PUEDE_RECIBIR.has(imp.estado) && !terminada && (
        <Aviso tipo="info">La recepción se habilita cuando la importación está en “Arribado”.</Aviso>
      )}
      {terminada && <Aviso tipo="ok">La recepción está terminada.</Aviso>}
      <Aviso tipo="info">Por ahora la recepción <strong>no suma al stock</strong>: falta que el cliente confirme cómo quiere que se haga.</Aviso>
      {resultado && (
        resultado.length ? (
          <Aviso>
            Se registró la recepción con diferencias y se creó una incidencia:
            <ul className="mt-1 list-disc pl-5">{resultado.map((r) => <li key={r}>{r}</li>)}</ul>
          </Aviso>
        ) : (
          <Aviso tipo="ok">Recepción registrada. Todo coincide con lo pedido.</Aviso>
        )
      )}

      {habilitada && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <PackageCheck className="h-4 w-4" /> Cargar lo que llegó
            </h3>
            <button type="button" onClick={completarTodo} className="text-xs font-medium text-emerald-700 hover:underline">
              Llegó todo lo pendiente
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2">Producto</th>
                  <th className="py-2 text-right">Pedido</th>
                  <th className="py-2 text-right">Ya recibido</th>
                  <th className="py-2 text-right">Llegó ahora</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t border-slate-100">
                    <td className="py-2 font-medium text-slate-800">{i.producto_nombre}</td>
                    <td className="py-2 text-right">{cant(i.cantidad)}</td>
                    <td className="py-2 text-right text-slate-500">{cant(i.cantidad_recibida)}</td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={cantidades[i.id] ?? ""}
                        onWheel={noRueda}
                        onChange={(e) => setCantidades({ ...cantidades, [i.id]: e.target.value })}
                        className={`${sinFlechas} ml-auto block w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Observación</label>
              <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputClass} placeholder="Ej.: 2 cajas golpeadas" />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} className="mt-0.5" />
            <span>
              <strong>Ya llegó todo lo que iba a llegar.</strong> Tildalo solo en la última entrega: cierra la recepción y, si falta algo, crea una incidencia.
            </span>
          </label>
          {error && <Aviso>{error}</Aviso>}
          <div className="flex justify-end">
            <button onClick={() => setConfirmar(true)} disabled={saving || (!hayAlgo && !final)} className={btnPrimario}>
              Registrar recepción
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800">Recepciones registradas</h3>
        {recepciones.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Todavía no se recibió nada.</p>}
        {recepciones.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
            <p className="font-medium text-slate-800">
              {fechaES(r.fecha)} {r.final && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Final</span>}
            </p>
            <p className="text-xs text-slate-500">
              Registró {r.usuario_nombre ?? "—"} el {fechaHora(r.created_at)}
            </p>
            <ul className="mt-1 text-xs text-slate-700">
              {r.items.map((l) => (
                <li key={l.item_id}>
                  {nombre.get(l.item_id) ?? "Producto"}: {cant(l.cantidad)}
                </li>
              ))}
            </ul>
            {r.observacion && <p className="mt-1 text-xs text-slate-600">{r.observacion}</p>}
          </div>
        ))}
      </div>

      <ConfirmModal
        open={confirmar}
        title="Registrar recepción"
        loading={saving}
        message={
          previa.length ? (
            <div>
              <p>Hay diferencias con lo pedido. Se va a crear una incidencia:</p>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {previa.map(({ i, total, dif }) => (
                  <li key={i.id}>
                    {i.producto_nombre}: pedido {cant(i.cantidad)}, recibido {cant(total)} ({dif > 0 ? `sobran ${cant(dif)}` : `faltan ${cant(-dif)}`})
                  </li>
                ))}
              </ul>
            </div>
          ) : final ? (
            "Todo coincide con lo pedido. La recepción queda terminada."
          ) : (
            "Se registra esta parte. Después se puede cargar el resto."
          )
        }
        confirmLabel="Registrar"
        onConfirm={() => void registrar()}
        onCancel={() => setConfirmar(false)}
      />
    </section>
  );
}
