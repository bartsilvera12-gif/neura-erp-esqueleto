"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Calculator, Receipt } from "lucide-react";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import ArqueoDenominaciones, { arqueoVacio, cantidadesAArqueo, totalArqueo, type ArqueoCantidades } from "@/components/caja/ArqueoDenominaciones";
import { Aviso, ModalShell, api, btnPrimario, btnSecundario, fechaES, fechaHora, inputClass, jsonInit, labelClass, noRueda, sinFlechas } from "@/components/comex/ui";
import { ModalCaja, ModalTransferencia, plata, useTesoreria, type Caja } from "../../_components/comun";

type Mov = { id: string; tipo: string; monto: number; fecha: string; referencia: string | null; observacion: string | null; compra_id: string | null; usuario_nombre: string | null; saldo: number };
type Arqueo = { id: string; fecha: string; saldo_sistema: number; contado: number; diferencia: number; observacion: string | null; ajuste_movimiento_id: string | null; usuario_nombre: string | null };
const TIPO: Record<string, string> = { aporte: "Reposición", gasto: "Gasto", retiro: "Devolución al banco", ajuste: "Ajuste", saldo_inicial: "Saldo inicial" };

export default function CajaChicaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isAdmin } = useIsAdmin();
  const tes = useTesoreria();
  const [d, setD] = useState<{ caja: Caja; movimientos: Mov[]; saldo: number; arqueos: Arqueo[] } | null>(null);
  const [modal, setModal] = useState<"reponer" | "devolver" | "arqueo" | "editar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setD(await api(`/api/tesoreria/cajas/${id}/movimientos`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [id]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (!d) return <p className="text-sm text-slate-500">{error ?? "Cargando…"}</p>;
  const m = d.caja.moneda;
  const gastado = d.caja.fondo_fijo ? Math.max(0, Number(d.caja.fondo_fijo) - d.saldo) : null;

  // Resumen del período: desde el último arqueo hasta hoy. Si nunca se hizo uno, desde el principio.
  const ultimo = d.arqueos[0] ?? null;
  const desde = ultimo ? ultimo.fecha : null;
  const delPeriodo = desde ? d.movimientos.filter((x) => x.fecha > desde) : d.movimientos;
  const suma = (p: (t: string, monto: number) => boolean) => delPeriodo.filter((x) => p(x.tipo, Number(x.monto))).reduce((t, x) => t + Math.abs(Number(x.monto)), 0);
  const resumen = {
    inicial: ultimo ? Number(ultimo.contado) : 0,
    entradas: suma((t, monto) => t === "aporte" || t === "saldo_inicial" || (t === "ajuste" && monto > 0)),
    gastos: suma((t) => t === "gasto"),
    otrasSalidas: suma((t, monto) => t === "retiro" || (t === "ajuste" && monto < 0)),
    cantidadGastos: delPeriodo.filter((x) => x.tipo === "gasto").length,
  };

  return (
    <div className="space-y-5">
      <Link href="/tesoreria" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Bancos y cajas chicas
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Caja chica</p>
          <h1 className="text-2xl font-semibold text-slate-900">{d.caja.nombre}</h1>
          <p className="text-sm text-slate-500">
            Responsable {d.caja.responsable_nombre ?? "sin asignar"}
            {d.caja.fondo_fijo ? ` · Fondo fijo ${plata(Number(d.caja.fondo_fijo), m)}` : ""}
            {d.caja.tope_gasto ? ` · Tope por gasto ${plata(Number(d.caja.tope_gasto), m)}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase text-slate-500">Hay en caja</p>
          <p className="text-3xl font-semibold text-slate-900">{plata(d.saldo, m)}</p>
          {gastado !== null && gastado > 0 && <p className="text-xs text-slate-500">Gastado desde la última reposición: {plata(gastado, m)}</p>}
        </div>
      </header>
      {/* Resumen para el arqueo: de dónde salió el saldo que dice el sistema. */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">
          {ultimo ? `Desde el último arqueo (${fechaHora(ultimo.fecha)})` : "Desde que se abrió la caja"}
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <dt className="text-xs uppercase text-slate-500">{ultimo ? "Contado en el arqueo" : "Saldo inicial"}</dt>
            <dd className="font-medium text-slate-800">{plata(resumen.inicial, m)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Reposiciones</dt>
            <dd className="font-medium text-emerald-700">+ {plata(resumen.entradas, m)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Gastos ({resumen.cantidadGastos})</dt>
            <dd className="font-medium text-rose-700">− {plata(resumen.gastos, m)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Otras salidas</dt>
            <dd className="font-medium text-rose-700">− {plata(resumen.otrasSalidas, m)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Saldo según el sistema</dt>
            <dd className="text-base font-semibold text-slate-900">{plata(d.saldo, m)}</dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href={`/libro-compras/nuevo?caja=${id}`} className={btnPrimario}>
          <Receipt className="h-3.5 w-3.5" /> Registrar gasto
        </Link>
        <button onClick={() => setModal("reponer")} className={btnSecundario}>Reponer desde el banco</button>
        <button onClick={() => setModal("arqueo")} className={btnSecundario}>
          <Calculator className="h-3.5 w-3.5" /> Hacer arqueo
        </button>
        <button onClick={() => setModal("devolver")} className={btnSecundario}>Devolver al banco</button>
        {isAdmin && <button onClick={() => setModal("editar")} className={btnSecundario}>Editar caja</button>}
      </div>
      {error && <Aviso>{error}</Aviso>}
      {aviso && <Aviso tipo="info">{aviso}</Aviso>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Movimiento</th>
              <th className="px-4 py-3 text-right">Entra</th>
              <th className="px-4 py-3 text-right">Sale</th>
              <th className="px-4 py-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {d.movimientos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">Sin movimientos. Empezá con “Reponer desde el banco”.</td>
              </tr>
            )}
            {d.movimientos.map((x) => {
              const entra = x.tipo === "aporte" || x.tipo === "saldo_inicial" || (x.tipo === "ajuste" && Number(x.monto) > 0);
              return (
                <tr key={x.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 whitespace-nowrap">{fechaES(x.fecha)}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-semibold text-slate-500">{TIPO[x.tipo] ?? x.tipo}</span>{" "}
                    {x.compra_id ? (
                      <Link href={`/libro-compras/${x.compra_id}`} className="text-emerald-700 hover:underline">{x.observacion}</Link>
                    ) : (
                      x.observacion
                    )}
                    <div className="text-[11px] text-slate-400">{x.usuario_nombre ?? ""}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-emerald-700">{entra ? plata(Math.abs(x.monto), m) : ""}</td>
                  <td className="px-4 py-2.5 text-right text-rose-700">{entra ? "" : plata(Math.abs(x.monto), m)}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{plata(x.saldo, m)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-800">Arqueos</h2>
        {d.arqueos.length === 0 && <p className="text-sm text-slate-500">Todavía no se hizo ningún arqueo.</p>}
        {d.arqueos.map((a) => (
          <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
            <p className="font-medium text-slate-800">
              {fechaHora(a.fecha)} · {a.usuario_nombre ?? "—"}
            </p>
            <p className="text-slate-600">
              Sistema {plata(a.saldo_sistema, m)} · Contado {plata(a.contado, m)} ·{" "}
              <strong className={Number(a.diferencia) === 0 ? "text-emerald-700" : "text-rose-700"}>
                {Number(a.diferencia) === 0 ? "Sin diferencia" : `Diferencia ${Number(a.diferencia) > 0 ? "+" : ""}${plata(a.diferencia, m)}`}
              </strong>
              {a.ajuste_movimiento_id && " · ajustado"}
            </p>
            {a.observacion && <p className="text-xs text-slate-500">{a.observacion}</p>}
          </div>
        ))}
      </section>

      {(modal === "reponer" || modal === "devolver") && tes.datos && (
        <ModalTransferencia
          bancos={tes.datos.bancos}
          cajas={tes.datos.cajas}
          origenInicial={modal === "devolver" ? `CAJA:${id}` : undefined}
          destinoInicial={modal === "reponer" ? `CAJA:${id}` : undefined}
          onClose={() => setModal(null)}
          onDone={(a) => {
            setModal(null);
            setAviso(a ?? (modal === "reponer" ? "Caja repuesta." : "Devolución registrada."));
            void cargar();
            void tes.cargar();
          }}
        />
      )}
      {modal === "arqueo" && (
        <ModalArqueo
          cajaId={id}
          moneda={m}
          saldo={d.saldo}
          onClose={() => setModal(null)}
          onDone={(texto) => {
            setModal(null);
            setAviso(texto);
            void cargar();
          }}
        />
      )}
      {modal === "editar" && (
        <ModalCaja
          caja={{ ...d.caja, saldo: d.saldo }}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function ModalArqueo({ cajaId, moneda, saldo, onClose, onDone }: { cajaId: string; moneda: string; saldo: number; onClose: () => void; onDone: (t: string) => void }) {
  const [cant, setCant] = useState<ArqueoCantidades>(arqueoVacio);
  const [contadoOtro, setContadoOtro] = useState("");
  const [obs, setObs] = useState("");
  const [ajustar, setAjustar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contado = moneda === "PYG" ? totalArqueo(cant) : Number(contadoOtro) || 0;
  const dif = Math.round((contado - saldo) * 100) / 100;

  return (
    <ModalShell title="Arqueo de caja chica" onClose={onClose} ancho="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Contá la plata que hay en la caja. El sistema la compara con lo que debería haber.</p>
        {moneda === "PYG" ? (
          <ArqueoDenominaciones value={cant} onChange={setCant} />
        ) : (
          <div>
            <label className={labelClass}>Total contado ({moneda})</label>
            <input type="number" min={0} step="any" value={contadoOtro} onWheel={noRueda} onChange={(e) => setContadoOtro(e.target.value)} className={`${inputClass} ${sinFlechas} text-right`} />
          </div>
        )}
        <div className="grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3 text-center text-sm">
          <div>
            <p className="text-xs text-slate-500">Debería haber</p>
            <p className="font-semibold">{plata(saldo, moneda)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Contado</p>
            <p className="font-semibold">{plata(contado, moneda)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Diferencia</p>
            <p className={`font-semibold ${dif === 0 ? "text-emerald-700" : "text-rose-700"}`}>{dif === 0 ? "Ninguna" : `${dif > 0 ? "sobra " : "falta "}${plata(Math.abs(dif), moneda)}`}</p>
          </div>
        </div>
        <div>
          <label className={labelClass}>Observación {ajustar && dif !== 0 ? "*" : ""}</label>
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ej.: falta el comprobante de un taxi" className={inputClass} />
        </div>
        {dif !== 0 && (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={ajustar} onChange={(e) => setAjustar(e.target.checked)} className="mt-0.5" />
            <span>Ajustar el saldo del sistema a lo contado (queda registrado como ajuste, con la observación).</span>
          </label>
        )}
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnSecundario}>Cancelar</button>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const r = await api<{ diferencia: number }>(
                  `/api/tesoreria/cajas/${cajaId}/arqueos`,
                  jsonInit("POST", { detalle: moneda === "PYG" ? cantidadesAArqueo(cant) : undefined, contado: moneda === "PYG" ? undefined : contado, observacion: obs, ajustar })
                );
                onDone(r.diferencia === 0 ? "Arqueo registrado: la caja está justa." : `Arqueo registrado con diferencia de ${plata(r.diferencia, moneda)}${ajustar ? " (ajustada)" : ""}.`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Error");
                setSaving(false);
              }
            }}
            className={btnPrimario}
          >
            {saving ? "Guardando…" : "Registrar arqueo"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
