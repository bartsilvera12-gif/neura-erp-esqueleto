"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Recibo = {
  id: string;
  numero_recibo: string;
  fecha: string;
  monto: number;
  metodo_pago: string | null;
  referencia: string | null;
  concepto: string | null;
  anulado: boolean;
};

export function FacturaCobrosModal({
  factura,
  onClose,
}: {
  factura: { id: string; numero: string; total: number; moneda: "PYG" | "USD" };
  onClose: () => void;
}) {
  const [recibos, setRecibos] = useState<Recibo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [referencia, setReferencia] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const r = await fetchWithSupabaseSession(
      `/api/recibos-dinero?factura_exportacion_id=${encodeURIComponent(factura.id)}`,
      { cache: "no-store" },
    );
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { recibos: Recibo[] }; error?: string };
    if (!r.ok || !j.success) { setError(j.error ?? `Error ${r.status}`); return; }
    setRecibos(j.data?.recibos ?? []);
  }, [factura.id]);

  useEffect(() => { void cargar(); }, [cargar]);

  const cobrado = (recibos ?? []).filter((x) => !x.anulado).reduce((a, r) => a + Number(r.monto), 0);
  const saldo = Math.max(0, factura.total - cobrado);
  const moneda = factura.moneda === "USD" ? "USD" : "Gs";
  const fmt = (n: number) => `${moneda} ${n.toLocaleString("es-PY", { maximumFractionDigits: moneda === "USD" ? 2 : 0 })}`;

  async function registrar() {
    setMensaje(null); setError(null);
    const m = Number(String(monto).replace(/\./g, "").replace(",", "."));
    if (!(m > 0)) { setError("Monto inválido."); return; }
    if (m > saldo + 0.001) { setError(`El monto supera el saldo (${fmt(saldo)}).`); return; }
    setGuardando(true);
    const r = await fetchWithSupabaseSession(`/api/recibos-dinero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origen: "manual",
        factura_exportacion_id: factura.id,
        manual: { monto: m, metodo_pago: metodo, referencia: referencia.trim() || null },
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
    setGuardando(false);
    if (!r.ok || !j.success) { setError(j.error ?? `Error ${r.status}`); return; }
    setMensaje("Cobro registrado.");
    setMonto(""); setReferencia("");
    await cargar();
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-900/60 backdrop-blur-sm pt-16 px-4" onClick={onClose}>
      <div className="zx-surface w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Cobros de la factura {factura.numero}</h2>
            <p className="text-xs text-slate-500">
              Total: <strong>{fmt(factura.total)}</strong> &middot; Cobrado: {fmt(cobrado)} &middot; Saldo: <strong className={saldo > 0 ? "text-amber-700" : "text-emerald-700"}>{fmt(saldo)}</strong>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {mensaje && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{mensaje}</div>}

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Recibos aplicados</h3>
            {recibos === null && <p className="text-sm text-slate-400">Cargando…</p>}
            {recibos !== null && recibos.length === 0 && (
              <p className="text-sm text-slate-500 italic">Sin cobros registrados todavía.</p>
            )}
            {recibos && recibos.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600">
                    <tr><th className="px-3 py-2 text-left">Nº Recibo</th><th className="px-3 py-2 text-left">Fecha</th><th className="px-3 py-2 text-left">Método</th><th className="px-3 py-2 text-right">Monto</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recibos.map((r) => (
                      <tr key={r.id} className={r.anulado ? "opacity-50 line-through" : ""}>
                        <td className="px-3 py-2 font-mono text-xs">{r.numero_recibo}</td>
                        <td className="px-3 py-2">{r.fecha}</td>
                        <td className="px-3 py-2 text-slate-600">{r.metodo_pago ?? "—"} {r.referencia ? `· ${r.referencia}` : ""}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(Number(r.monto))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {saldo > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registrar nuevo cobro</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Monto</label>
                  <input type="text" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder={`Saldo: ${fmt(saldo)}`} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Método</label>
                  <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="cheque">Cheque</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Referencia</label>
                  <input type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Nº cheque, transferencia…" />
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={registrar} disabled={guardando}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">
                  {guardando ? "Registrando…" : "Registrar cobro"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
