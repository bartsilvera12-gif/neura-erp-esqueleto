"use client";

import { useEffect, useState } from "react";
import { Aviso, ModalShell, api, btnPrimario, btnSecundario, inputClass, jsonInit, labelClass, noRueda, sinFlechas } from "@/components/comex/ui";

type Pago = { metodo_pago: string; monto: string; entidad_bancaria_id: string; referencia: string };
type Entidad = { id: string; nombre: string };
const METODOS = [
  ["efectivo", "Efectivo"],
  ["transferencia", "Transferencia"],
  ["tarjeta", "Tarjeta"],
  ["qr", "QR"],
  ["billetera", "Billetera"],
  ["otro", "Otro"],
];
const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;

/**
 * Corrige una venta ya generada: observaciones y cómo se cobró (uno o varios
 * medios de pago). No cambia productos, totales ni stock.
 */
export function EditarVentaModal({ ventaId, onClose, onDone }: { ventaId: string; onClose: () => void; onDone: () => void }) {
  const [numero, setNumero] = useState("");
  const [total, setTotal] = useState(0);
  const [obs, setObs] = useState("");
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [entidades, setEntidades] = useState<Entidad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ venta: { numero_control: string; total: number; observaciones: string | null; metodo_pago: string | null }; pagos: { metodo_pago: string; monto: number; entidad_bancaria_id: string | null; referencia: string | null }[] }>(`/api/ventas/${ventaId}`)
      .then((d) => {
        setNumero(d.venta.numero_control);
        setTotal(Number(d.venta.total) || 0);
        setObs(d.venta.observaciones ?? "");
        setPagos(
          d.pagos.length
            ? d.pagos.map((p) => ({ metodo_pago: p.metodo_pago, monto: String(Number(p.monto) || 0), entidad_bancaria_id: p.entidad_bancaria_id ?? "", referencia: p.referencia ?? "" }))
            : [{ metodo_pago: d.venta.metodo_pago || "efectivo", monto: String(Number(d.venta.total) || 0), entidad_bancaria_id: "", referencia: "" }]
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setCargando(false));
    api<{ entidades: Entidad[] }>("/api/entidades-bancarias")
      .then((d) => setEntidades(d.entidades ?? []))
      .catch(() => undefined);
  }, [ventaId]);

  const suma = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const falta = total - suma;
  const set = (i: number, campo: keyof Pago, valor: string) => setPagos((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)));

  async function guardar() {
    setSaving(true);
    setError(null);
    try {
      await api(
        `/api/ventas/${ventaId}`,
        jsonInit("PATCH", {
          observaciones: obs,
          pagos: pagos.map((p) => ({ metodo_pago: p.metodo_pago, monto: Number(p.monto) || 0, entidad_bancaria_id: p.metodo_pago === "efectivo" ? null : p.entidad_bancaria_id || null, referencia: p.referencia })),
        })
      );
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Editar venta ${numero}`} onClose={onClose} ancho="max-w-2xl">
      <div className="space-y-4 p-5">
        {cargando ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Se puede corregir <strong>cómo se cobró</strong> y las observaciones. Los productos y el total ({gs(total)}) no cambian: para eso hay que eliminar la venta y hacerla de nuevo.
            </p>
            <div className="space-y-2">
              <label className={labelClass}>Formas de pago</label>
              {pagos.map((p, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[150px_130px_1fr_1fr_auto]">
                  <select value={p.metodo_pago} onChange={(e) => set(i, "metodo_pago", e.target.value)} className={inputClass} aria-label="Forma de pago">
                    {METODOS.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <input type="number" min={0} step="any" value={p.monto} onWheel={noRueda} onChange={(e) => set(i, "monto", e.target.value.replace(/^0+(?=\d)/, ""))} className={`${inputClass} ${sinFlechas} text-right`} aria-label="Monto" />
                  {p.metodo_pago === "efectivo" ? (
                    <span className="hidden sm:block" />
                  ) : (
                    <select value={p.entidad_bancaria_id} onChange={(e) => set(i, "entidad_bancaria_id", e.target.value)} className={inputClass} aria-label="Entidad o banco">
                      <option value="">— Entidad / banco —</option>
                      {entidades.map((e) => (
                        <option key={e.id} value={e.id}>{e.nombre}</option>
                      ))}
                    </select>
                  )}
                  <input value={p.referencia} onChange={(e) => set(i, "referencia", e.target.value)} placeholder="Referencia" className={inputClass} />
                  <button type="button" onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))} disabled={pagos.length === 1} className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-30">
                    Quitar
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setPagos((ps) => [...ps, { metodo_pago: "transferencia", monto: falta > 0 ? String(Math.round(falta)) : "", entidad_bancaria_id: "", referencia: "" }])}
                  className="text-xs font-medium text-emerald-700 hover:underline"
                >
                  + Agregar otra forma de pago
                </button>
                <span className={`text-sm ${Math.abs(falta) > 0.5 ? "font-semibold text-rose-700" : "text-slate-600"}`}>
                  Suman {gs(suma)} de {gs(total)}
                  {Math.abs(falta) > 0.5 && (falta > 0 ? ` · faltan ${gs(falta)}` : ` · sobran ${gs(-falta)}`)}
                </span>
              </div>
            </div>
            <div>
              <label className={labelClass}>Observaciones</label>
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={inputClass} />
            </div>
          </>
        )}
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecundario}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={saving || cargando || Math.abs(falta) > 0.5} className={btnPrimario}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
