"use client";

import { useEffect, useState } from "react";
import { Aviso, ModalShell, api, btnPrimario, btnSecundario, hoyPY, inputClass, jsonInit, labelClass, noRueda, sinFlechas } from "@/components/comex/ui";
import { plata, type Banco, type Caja } from "@/app/tesoreria/_components/comun";

/** Selector "de dónde sale el dinero": cuentas bancarias y cajas chicas de la moneda. */
export function OrigenDinero({
  moneda,
  medio,
  cuentaId,
  onChange,
  permitirNinguno = false,
}: {
  moneda: string;
  medio: string;
  cuentaId: string;
  onChange: (medio: string, cuentaId: string) => void;
  permitirNinguno?: boolean;
}) {
  const [cuentas, setCuentas] = useState<{ bancos: Banco[]; cajas: Caja[] } | null>(null);
  useEffect(() => {
    api<{ bancos: Banco[]; cajas: Caja[] }>("/api/tesoreria").then(setCuentas).catch(() => undefined);
  }, []);
  const bancos = cuentas?.bancos.filter((b) => b.activo && (b.moneda ?? "PYG") === moneda) ?? [];
  const cajas = cuentas?.cajas.filter((c) => c.activa && c.moneda === moneda) ?? [];
  const valor = medio && cuentaId ? `${medio}:${cuentaId}` : "";
  return (
    <div>
      <select
        value={valor}
        onChange={(e) => {
          const [m, id] = e.target.value.split(":");
          onChange(m ?? "", id ?? "");
        }}
        className={inputClass}
      >
        <option value="">{permitirNinguno ? "— No registrar el pago ahora —" : "— Elegir —"}</option>
        {bancos.length > 0 && (
          <optgroup label="Cuentas bancarias">
            {bancos.map((b) => (
              <option key={b.id} value={`BANCO:${b.id}`}>
                {b.nombre} {b.numero_cuenta ? `(${b.numero_cuenta})` : ""} · saldo {plata(b.saldo, b.moneda)}
              </option>
            ))}
          </optgroup>
        )}
        {cajas.length > 0 && (
          <optgroup label="Cajas chicas">
            {cajas.map((c) => (
              <option key={c.id} value={`CAJA_CHICA:${c.id}`}>
                {c.nombre} · hay {plata(c.saldo, c.moneda)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {cuentas && !bancos.length && !cajas.length && (
        <p className="mt-1 text-xs text-amber-700">No hay cuentas bancarias ni cajas chicas en {moneda}. Se cargan en Finanzas → Bancos y cajas chicas.</p>
      )}
    </div>
  );
}

/** Pagar (una parte de) una cuota de una compra a crédito. */
export function ModalPagoCuota({
  compraId,
  cuotaNro,
  saldo,
  moneda,
  titulo,
  onClose,
  onDone,
}: {
  compraId: string;
  cuotaNro: number;
  saldo: number;
  moneda: string;
  titulo: string;
  onClose: () => void;
  onDone: (aviso: string | null) => void;
}) {
  const [monto, setMonto] = useState(String(saldo));
  const [fecha, setFecha] = useState(hoyPY);
  const [medio, setMedio] = useState("");
  const [cuenta, setCuenta] = useState("");
  const [ref, setRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ModalShell title={titulo} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Cuota {cuotaNro}: quedan <strong>{plata(saldo, moneda)}</strong> por pagar.
        </p>
        <div>
          <label className={labelClass}>Sale de *</label>
          <OrigenDinero moneda={moneda} medio={medio} cuentaId={cuenta} onChange={(m, c) => { setMedio(m); setCuenta(c); }} />
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
          <div className="col-span-2">
            <label className={labelClass}>Referencia</label>
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="N° de cheque o transferencia" className={inputClass} />
          </div>
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnSecundario}>Cancelar</button>
          <button
            disabled={saving || !cuenta || !(Number(monto) > 0)}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                const r = await api<{ aviso: string | null }>(
                  `/api/libro-compras/${compraId}/pagos`,
                  jsonInit("POST", { cuota_nro: cuotaNro, monto: Number(monto), fecha, medio, cuenta_id: cuenta, referencia: ref })
                );
                onDone(r.aviso);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Error");
                setSaving(false);
              }
            }}
            className={btnPrimario}
          >
            {saving ? "Guardando…" : "Registrar pago"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
