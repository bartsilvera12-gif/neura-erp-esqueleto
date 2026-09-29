"use client";

import { useEffect, useState } from "react";
import { Aviso, ModalShell, ResponsableSelect, api, btnPrimario, btnSecundario, hoyPY, inputClass, jsonInit, labelClass, noRueda, sinFlechas, useUsuarios } from "@/components/comex/ui";

export interface Banco {
  id: string;
  nombre: string;
  numero_cuenta: string | null;
  moneda: string;
  titular: string | null;
  saldo_inicial: number;
  fecha_saldo_inicial: string | null;
  cuenta_contable_codigo: string | null;
  activo: boolean;
  saldo: number;
}
export interface Caja {
  id: string;
  nombre: string;
  moneda: string;
  tope_gasto: number | null;
  fondo_fijo: number | null;
  responsable_id: string | null;
  responsable_nombre: string | null;
  cuenta_contable_codigo: string | null;
  activa: boolean;
  saldo: number;
}

export const plata = (v: number, m: string) =>
  `${m === "PYG" ? "Gs." : m} ${Number(v).toLocaleString("es-PY", { maximumFractionDigits: m === "PYG" ? 0 : 2, minimumFractionDigits: m === "PYG" ? 0 : 2 })}`;

export function useTesoreria() {
  const [datos, setDatos] = useState<{ bancos: Banco[]; cajas: Caja[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = () =>
    api<{ bancos: Banco[]; cajas: Caja[] }>("/api/tesoreria")
      .then(setDatos)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  useEffect(() => {
    void cargar();
  }, []);
  return { datos, error, cargar };
}

/** Transferencia entre cuentas: banco → caja chica (reposición), banco → banco, caja → banco. */
export function ModalTransferencia({
  bancos,
  cajas,
  origenInicial,
  destinoInicial,
  onClose,
  onDone,
}: {
  bancos: Banco[];
  cajas: Caja[];
  origenInicial?: string;
  destinoInicial?: string;
  onClose: () => void;
  onDone: (aviso: string | null) => void;
}) {
  const opciones = [
    ...bancos.filter((b) => b.activo).map((b) => ({ v: `BANCO:${b.id}`, t: `Banco · ${b.nombre}${b.numero_cuenta ? ` (${b.numero_cuenta})` : ""} · ${plata(b.saldo, b.moneda)}`, moneda: b.moneda })),
    ...cajas.filter((c) => c.activa).map((c) => ({ v: `CAJA:${c.id}`, t: `Caja chica · ${c.nombre} · ${plata(c.saldo, c.moneda)}`, moneda: c.moneda })),
  ];
  const [origen, setOrigen] = useState(origenInicial ?? "");
  const [destino, setDestino] = useState(destinoInicial ?? "");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyPY);
  const [ref, setRef] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const punta = (v: string) => ({ tipo: v.split(":")[0], id: v.split(":")[1] });
  const destinoCaja = cajas.find((c) => `CAJA:${c.id}` === destino);

  return (
    <ModalShell title={destino.startsWith("CAJA") ? "Reponer caja chica" : "Transferir entre cuentas"} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Sale de</label>
          <select value={origen} onChange={(e) => setOrigen(e.target.value)} className={inputClass}>
            <option value="">— Elegir —</option>
            {opciones.map((o) => (
              <option key={o.v} value={o.v}>
                {o.t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Entra a</label>
          <select value={destino} onChange={(e) => setDestino(e.target.value)} className={inputClass}>
            <option value="">— Elegir —</option>
            {opciones
              .filter((o) => o.v !== origen)
              .map((o) => (
                <option key={o.v} value={o.v}>
                  {o.t}
                </option>
              ))}
          </select>
          {destinoCaja?.fondo_fijo ? (
            <button
              type="button"
              onClick={() => setMonto(String(Math.max(0, Number(destinoCaja.fondo_fijo) - destinoCaja.saldo)))}
              className="mt-1 text-xs font-medium text-emerald-700 hover:underline"
            >
              Completar hasta el fondo fijo ({plata(Number(destinoCaja.fondo_fijo), destinoCaja.moneda)})
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Monto *</label>
            <input type="number" min={0} step="any" value={monto} onWheel={noRueda} onChange={(e) => setMonto(e.target.value)} className={`${inputClass} ${sinFlechas} text-right`} />
          </div>
          <div>
            <label className={labelClass}>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Referencia</label>
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="N° de cheque o transferencia" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Concepto</label>
            <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputClass} />
          </div>
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnSecundario}>
            Cancelar
          </button>
          <button
            disabled={saving || !origen || !destino || !(Number(monto) > 0)}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const d = await api<{ aviso: string | null }>(
                  "/api/tesoreria/transferencias",
                  jsonInit("POST", { origen: punta(origen), destino: punta(destino), monto: Number(monto), fecha, referencia: ref, observacion: obs })
                );
                onDone(d.aviso);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Error");
                setSaving(false);
              }
            }}
            className={btnPrimario}
          >
            {saving ? "Guardando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function ModalBanco({ banco, onClose, onDone }: { banco: Banco | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    nombre: banco?.nombre ?? "",
    numero_cuenta: banco?.numero_cuenta ?? "",
    moneda: banco?.moneda ?? "PYG",
    titular: banco?.titular ?? "",
    saldo_inicial: banco ? String(banco.saldo_inicial ?? 0) : "",
    fecha_saldo_inicial: banco?.fecha_saldo_inicial ?? hoyPY(),
    cuenta_contable_codigo: banco?.cuenta_contable_codigo ?? "",
    activo: banco?.activo ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <ModalShell title={banco ? `Cuenta ${banco.nombre}` : "Nueva cuenta bancaria"} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelClass}>Banco *</label>
            <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: Banco Continental" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>N° de cuenta</label>
            <input value={f.numero_cuenta} onChange={(e) => setF({ ...f, numero_cuenta: e.target.value })} className={`${inputClass} font-mono`} />
          </div>
          <div>
            <label className={labelClass}>Moneda</label>
            <select value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })} className={inputClass}>
              <option value="PYG">Guaraníes</option>
              <option value="USD">Dólares</option>
              <option value="BOB">Bolivianos</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Titular</label>
            <input value={f.titular} onChange={(e) => setF({ ...f, titular: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Saldo al empezar</label>
            <input type="number" step="any" value={f.saldo_inicial} onWheel={noRueda} onChange={(e) => setF({ ...f, saldo_inicial: e.target.value })} className={`${inputClass} ${sinFlechas} text-right`} />
          </div>
          <div>
            <label className={labelClass}>A la fecha</label>
            <input type="date" value={f.fecha_saldo_inicial} onChange={(e) => setF({ ...f, fecha_saldo_inicial: e.target.value })} className={inputClass} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Cuenta contable</label>
            <input value={f.cuenta_contable_codigo} onChange={(e) => setF({ ...f, cuenta_contable_codigo: e.target.value })} placeholder="1.01.01.02.000" className={`${inputClass} font-mono`} />
          </div>
        </div>
        {banco && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activa
          </label>
        )}
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnSecundario}>
            Cancelar
          </button>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const body = { ...f, saldo_inicial: Number(f.saldo_inicial) || 0 };
                if (banco) await api(`/api/tesoreria/bancos/${banco.id}`, jsonInit("PATCH", body));
                else await api("/api/tesoreria/bancos", jsonInit("POST", body));
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

export function ModalCaja({ caja, onClose, onDone }: { caja: Caja | null; onClose: () => void; onDone: () => void }) {
  const usuarios = useUsuarios();
  const [f, setF] = useState({
    nombre: caja?.nombre ?? "",
    moneda: caja?.moneda ?? "PYG",
    fondo_fijo: caja?.fondo_fijo ? String(caja.fondo_fijo) : "",
    tope_gasto: caja?.tope_gasto ? String(caja.tope_gasto) : "",
    responsable_id: caja?.responsable_id ?? null,
    responsable_nombre: caja?.responsable_nombre ?? null,
    cuenta_contable_codigo: caja?.cuenta_contable_codigo ?? "1.01.01.03.001",
    activa: caja?.activa ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <ModalShell title={caja ? `Caja chica ${caja.nombre}` : "Nueva caja chica"} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelClass}>Nombre *</label>
            <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: Caja chica oficina" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Moneda</label>
            <select value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })} className={inputClass}>
              <option value="PYG">Guaraníes</option>
              <option value="USD">Dólares</option>
              <option value="BOB">Bolivianos</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Responsable</label>
            <ResponsableSelect usuarios={usuarios} id={f.responsable_id} nombre={f.responsable_nombre} onChange={(id, nombre) => setF({ ...f, responsable_id: id, responsable_nombre: nombre })} />
          </div>
          <div>
            <label className={labelClass}>Fondo fijo</label>
            <input type="number" min={0} step="any" value={f.fondo_fijo} onWheel={noRueda} onChange={(e) => setF({ ...f, fondo_fijo: e.target.value })} placeholder="Ej.: 2.000.000" className={`${inputClass} ${sinFlechas} text-right`} />
          </div>
          <div>
            <label className={labelClass}>Tope por gasto</label>
            <input type="number" min={0} step="any" value={f.tope_gasto} onWheel={noRueda} onChange={(e) => setF({ ...f, tope_gasto: e.target.value })} placeholder="Sin tope" className={`${inputClass} ${sinFlechas} text-right`} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Cuenta contable</label>
            <input value={f.cuenta_contable_codigo} onChange={(e) => setF({ ...f, cuenta_contable_codigo: e.target.value })} className={`${inputClass} font-mono`} />
          </div>
        </div>
        {caja && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.activa} onChange={(e) => setF({ ...f, activa: e.target.checked })} /> Activa
          </label>
        )}
        {!caja && <p className="text-xs text-slate-500">Arranca en 0. Después se carga con “Reponer desde el banco”.</p>}
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnSecundario}>
            Cancelar
          </button>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                if (caja) await api(`/api/tesoreria/cajas/${caja.id}`, jsonInit("PATCH", f));
                else await api("/api/tesoreria/cajas", jsonInit("POST", f));
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
