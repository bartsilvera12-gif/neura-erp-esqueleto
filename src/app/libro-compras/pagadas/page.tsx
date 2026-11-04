"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Aviso, api, fechaES } from "@/components/comex/ui";
import { plata } from "@/app/tesoreria/_components/comun";

type Cuota = {
  nro: number;
  vencimiento: string;
  monto: number;
  pagado: number;
  saldo: number;
  fecha_pago: string | null;
  medio: string | null;
  compra_id: string;
  compra: { numero_control: string; nro_comprobante: string; proveedor_nombre: string; proveedor_ruc: string | null; moneda: string; tipo_nombre: string; fecha: string };
};

const medioLabel = (m: string | null) => (m === "CAJA_CHICA" ? "Caja chica" : m === "BANCO" ? "Banco" : "—");

/** Cuotas de compras a crédito ya saldadas, de la pagada más reciente a la más vieja. */
export default function PagadasPage() {
  const [cuotas, setCuotas] = useState<Cuota[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const cargar = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (desde) qs.set("desde", desde);
      if (hasta) qs.set("hasta", hasta);
      const url = `/api/libro-compras/pagadas${qs.toString() ? `?${qs}` : ""}`;
      setCuotas((await api<{ cuotas: Cuota[] }>(url)).cuotas);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [desde, hasta]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const texto = q.trim().toLowerCase();
  const lista = (cuotas ?? []).filter(
    (c) => !texto || c.compra.proveedor_nombre.toLowerCase().includes(texto) || c.compra.nro_comprobante.toLowerCase().includes(texto)
  );
  const totPorMoneda = new Map<string, number>();
  for (const c of lista) totPorMoneda.set(c.compra.moneda, (totPorMoneda.get(c.compra.moneda) ?? 0) + Number(c.monto));

  return (
    <div className="space-y-6">
      <Link href="/libro-compras/por-pagar" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Cuentas por pagar
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Compras</p>
          <h1 className="text-2xl font-semibold text-slate-900">Facturas pagadas</h1>
          <p className="text-sm text-slate-600">Cuotas de compras a crédito que ya están saldadas por completo.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">
            <span className="block mb-1 font-semibold uppercase tracking-wide">Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-slate-500">
            <span className="block mb-1 font-semibold uppercase tracking-wide">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar proveedor o comprobante"
            className="w-72 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </header>
      {error && <Aviso>{error}</Aviso>}
      {[...totPorMoneda.entries()].map(([m, t]) => (
        <div key={m} className="flex flex-wrap gap-6 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
          <span>
            Total pagado: <strong>{plata(t, m)}</strong>
          </span>
        </div>
      ))}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Pagada</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Comprobante</th>
              <th className="px-4 py-3">Cuota</th>
              <th className="px-4 py-3">Medio</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3 text-right">Asiento</th>
            </tr>
          </thead>
          <tbody>
            {cuotas && lista.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">No hay facturas pagadas todavía.</td>
              </tr>
            )}
            {lista.map((c) => (
              <tr key={`${c.compra_id}-${c.nro}`} className="border-t border-slate-100">
                <td className="px-4 py-2.5 whitespace-nowrap">{fechaES(c.fecha_pago)}</td>
                <td className="px-4 py-2.5">
                  {c.compra.proveedor_nombre}
                  {c.compra.proveedor_ruc && <div className="font-mono text-[11px] text-slate-400">{c.compra.proveedor_ruc}</div>}
                </td>
                <td className="px-4 py-2.5">
                  <Link href={`/libro-compras/${c.compra_id}`} className="font-mono text-emerald-700 hover:underline">{c.compra.nro_comprobante}</Link>
                  <div className="text-[11px] text-slate-400">{c.compra.tipo_nombre}</div>
                </td>
                <td className="px-4 py-2.5">{c.nro}</td>
                <td className="px-4 py-2.5 text-slate-600">{medioLabel(c.medio)}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{plata(c.monto, c.compra.moneda)}</td>
                <td className="px-4 py-2.5 text-right">
                  <a
                    href={`/api/libro-compras/${c.compra_id}/asiento-pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                    title="Abrir el asiento contable de la factura"
                  >
                    📄 Asiento
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
