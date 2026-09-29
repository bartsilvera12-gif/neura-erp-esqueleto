"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import { Aviso, ModalShell, api, btnPrimario, btnSecundario, fechaES, hoyPY, inputClass, jsonInit, labelClass, noRueda, sinFlechas } from "@/components/comex/ui";
import { ModalBanco, ModalTransferencia, plata, useTesoreria, type Banco } from "../../_components/comun";

type Mov = { id: string; tipo: string; monto: number; fecha: string; referencia: string | null; observacion: string | null; compra_id: string | null; usuario_nombre: string | null; saldo: number };
const INGRESO = new Set(["deposito", "transferencia_in", "ajuste"]);

export default function BancoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isAdmin } = useIsAdmin();
  const tes = useTesoreria();
  const [d, setD] = useState<{ cuenta: Banco; movimientos: Mov[]; saldo: number } | null>(null);
  const [modal, setModal] = useState<"deposito" | "retiro" | "transferir" | "editar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setD(await api(`/api/tesoreria/bancos/${id}/movimientos`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [id]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (!d) return <p className="text-sm text-slate-500">{error ?? "Cargando…"}</p>;
  const m = d.cuenta.moneda ?? "PYG";

  return (
    <div className="space-y-5">
      <Link href="/tesoreria" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Bancos y cajas chicas
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Cuenta bancaria</p>
          <h1 className="text-2xl font-semibold text-slate-900">{d.cuenta.nombre}</h1>
          <p className="font-mono text-sm text-slate-500">
            {d.cuenta.numero_cuenta ?? "Sin número"} · {m} {d.cuenta.titular ? `· ${d.cuenta.titular}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase text-slate-500">Saldo</p>
          <p className={`text-3xl font-semibold ${d.saldo < 0 ? "text-rose-600" : "text-slate-900"}`}>{plata(d.saldo, m)}</p>
        </div>
      </header>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setModal("deposito")} className={btnPrimario}>+ Ingreso</button>
        <button onClick={() => setModal("retiro")} className={btnSecundario}>− Egreso</button>
        <button onClick={() => setModal("transferir")} className={btnSecundario}>Transferir / reponer caja</button>
        {isAdmin && <button onClick={() => setModal("editar")} className={btnSecundario}>Editar cuenta</button>}
      </div>
      {error && <Aviso>{error}</Aviso>}
      {aviso && <Aviso tipo="info">{aviso}</Aviso>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Concepto</th>
              <th className="px-4 py-3">Referencia</th>
              <th className="px-4 py-3 text-right">Ingreso</th>
              <th className="px-4 py-3 text-right">Egreso</th>
              <th className="px-4 py-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {d.movimientos.map((x) => (
              <tr key={x.id} className="border-t border-slate-100">
                <td className="px-4 py-2.5 whitespace-nowrap">{fechaES(x.fecha)}</td>
                <td className="px-4 py-2.5">
                  {x.compra_id ? (
                    <Link href={`/libro-compras/${x.compra_id}`} className="text-emerald-700 hover:underline">
                      {x.observacion}
                    </Link>
                  ) : (
                    x.observacion ?? x.tipo
                  )}
                  <div className="text-[11px] text-slate-400">{x.usuario_nombre ?? ""}</div>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{x.referencia ?? ""}</td>
                <td className="px-4 py-2.5 text-right text-emerald-700">{INGRESO.has(x.tipo) ? plata(x.monto, m) : ""}</td>
                <td className="px-4 py-2.5 text-right text-rose-700">{INGRESO.has(x.tipo) ? "" : plata(x.monto, m)}</td>
                <td className="px-4 py-2.5 text-right font-medium">{plata(x.saldo, m)}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-100 bg-slate-50 text-slate-500">
              <td className="px-4 py-2.5">{d.cuenta.fecha_saldo_inicial ? fechaES(d.cuenta.fecha_saldo_inicial) : ""}</td>
              <td className="px-4 py-2.5" colSpan={4}>Saldo inicial</td>
              <td className="px-4 py-2.5 text-right">{plata(Number(d.cuenta.saldo_inicial) || 0, m)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {(modal === "deposito" || modal === "retiro") && (
        <ModalMovimiento
          tipo={modal}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            void cargar();
          }}
          bancoId={id}
        />
      )}
      {modal === "transferir" && tes.datos && (
        <ModalTransferencia
          bancos={tes.datos.bancos}
          cajas={tes.datos.cajas}
          origenInicial={`BANCO:${id}`}
          onClose={() => setModal(null)}
          onDone={(a) => {
            setModal(null);
            setAviso(a ?? "Transferencia registrada.");
            void cargar();
            void tes.cargar();
          }}
        />
      )}
      {modal === "editar" && (
        <ModalBanco
          banco={{ ...d.cuenta, saldo: d.saldo }}
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

function ModalMovimiento({ tipo, bancoId, onClose, onDone }: { tipo: "deposito" | "retiro"; bancoId: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ monto: "", fecha: hoyPY(), observacion: "", referencia: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <ModalShell title={tipo === "deposito" ? "Registrar ingreso" : "Registrar egreso"} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Monto *</label>
            <input type="number" min={0} step="any" value={f.monto} onWheel={noRueda} onChange={(e) => setF({ ...f, monto: e.target.value })} className={`${inputClass} ${sinFlechas} text-right`} />
          </div>
          <div>
            <label className={labelClass}>Fecha</label>
            <input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} className={inputClass} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Concepto *</label>
            <input value={f.observacion} onChange={(e) => setF({ ...f, observacion: e.target.value })} placeholder={tipo === "deposito" ? "Ej.: cobro cliente" : "Ej.: comisión bancaria"} className={inputClass} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Referencia</label>
            <input value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} className={inputClass} />
          </div>
        </div>
        <p className="text-xs text-slate-500">Los pagos de facturas de compra no se cargan acá: se registran en el Libro de compras y aparecen solos.</p>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnSecundario}>Cancelar</button>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await api(`/api/tesoreria/bancos/${bancoId}/movimientos`, jsonInit("POST", { ...f, tipo, monto: Number(f.monto) }));
                onDone();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Error");
                setSaving(false);
              }
            }}
            className={btnPrimario}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
