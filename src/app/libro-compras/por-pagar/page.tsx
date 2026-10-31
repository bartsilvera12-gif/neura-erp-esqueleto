"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Aviso, api, fechaES, hoyPY } from "@/components/comex/ui";
import { plata } from "@/app/tesoreria/_components/comun";
import { ModalPagoCuota, ModalPagoLote, type CuotaLote } from "../_components/ModalPago";

type Cuota = {
  nro: number;
  vencimiento: string;
  monto: number;
  pagado: number;
  saldo: number;
  pagare: string | null;
  compra_id: string;
  compra: { numero_control: string; nro_comprobante: string; proveedor_nombre: string; proveedor_ruc: string | null; moneda: string; tipo_nombre: string; fecha: string };
};

const claveCuota = (c: Cuota) => `${c.compra_id}-${c.nro}`;

/** Cuotas pendientes de compras a crédito, de la más vencida a la más lejana. */
export default function PorPagarPage() {
  const [cuotas, setCuotas] = useState<Cuota[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pagar, setPagar] = useState<Cuota | null>(null);
  const [pagarLote, setPagarLote] = useState<{ items: CuotaLote[]; moneda: string } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  const cargar = useCallback(async () => {
    try {
      setCuotas((await api<{ cuotas: Cuota[] }>("/api/libro-compras/por-pagar")).cuotas);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const hoy = hoyPY();
  const texto = q.trim().toLowerCase();
  const lista = (cuotas ?? []).filter(
    (c) => !texto || c.compra.proveedor_nombre.toLowerCase().includes(texto) || c.compra.nro_comprobante.toLowerCase().includes(texto)
  );
  const totPorMoneda = new Map<string, { total: number; vencido: number }>();
  for (const c of lista) {
    const t = totPorMoneda.get(c.compra.moneda) ?? { total: 0, vencido: 0 };
    t.total += c.saldo;
    if (c.vencimiento < hoy) t.vencido += c.saldo;
    totPorMoneda.set(c.compra.moneda, t);
  }

  // Selección: trabajo siempre sobre las cuotas visibles (filtradas).
  const seleccionadas = lista.filter((c) => sel.has(claveCuota(c)));
  const monedasSel = new Set(seleccionadas.map((c) => c.compra.moneda));
  const totalSel = seleccionadas.reduce((s, c) => s + c.saldo, 0);
  const todasVisiblesSel = lista.length > 0 && lista.every((c) => sel.has(claveCuota(c)));

  const toggle = (c: Cuota) =>
    setSel((prev) => {
      const next = new Set(prev);
      const k = claveCuota(c);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const toggleTodas = () =>
    setSel((prev) => {
      const next = new Set(prev);
      if (todasVisiblesSel) lista.forEach((c) => next.delete(claveCuota(c)));
      else lista.forEach((c) => next.add(claveCuota(c)));
      return next;
    });

  const abrirLote = () => {
    const moneda = [...monedasSel][0];
    setPagarLote({
      moneda,
      items: seleccionadas.map((c) => ({
        compra_id: c.compra_id,
        cuota_nro: c.nro,
        proveedor: c.compra.proveedor_nombre,
        comprobante: c.compra.nro_comprobante,
        saldo: c.saldo,
      })),
    });
  };

  return (
    <div className="space-y-6">
      <Link href="/libro-compras" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Libro de compras
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Compras</p>
          <h1 className="text-2xl font-semibold text-slate-900">Cuentas por pagar</h1>
          <p className="text-sm text-slate-600">Cuotas pendientes de las compras a crédito. Al pagar se descuenta del banco o la caja chica que elijas.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/libro-compras/pagadas" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Ver pagadas
          </Link>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar proveedor o comprobante"
            className="w-72 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </header>
      {error && <Aviso>{error}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      {[...totPorMoneda.entries()].map(([m, t]) => (
        <div key={m} className="flex flex-wrap gap-6 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
          <span>
            Total a pagar: <strong>{plata(t.total, m)}</strong>
          </span>
          <span className={t.vencido > 0 ? "text-rose-700" : "text-slate-500"}>
            Vencido: <strong>{plata(t.vencido, m)}</strong>
          </span>
        </div>
      ))}

      {seleccionadas.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm shadow-sm">
          <span className="font-medium text-emerald-900">
            {seleccionadas.length} cuota{seleccionadas.length === 1 ? "" : "s"} seleccionada{seleccionadas.length === 1 ? "" : "s"}
            {monedasSel.size === 1 && <> · total {plata(totalSel, [...monedasSel][0])}</>}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSel(new Set())} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Limpiar
            </button>
            <button
              onClick={abrirLote}
              disabled={monedasSel.size !== 1}
              title={monedasSel.size > 1 ? "Elegí cuotas de una sola moneda" : undefined}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Pagar seleccionadas
            </button>
          </div>
        </div>
      )}
      {monedasSel.size > 1 && (
        <p className="-mt-3 text-xs text-amber-700">Seleccionaste cuotas de varias monedas. Dejá una sola moneda para pagarlas juntas (una cuenta paga en una sola moneda).</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">
                <input type="checkbox" checked={todasVisiblesSel} onChange={toggleTodas} aria-label="Seleccionar todas" className="h-4 w-4 rounded border-slate-300" />
              </th>
              <th className="px-4 py-3">Vence</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Comprobante</th>
              <th className="px-4 py-3">Cuota</th>
              <th className="px-4 py-3 text-right">A pagar</th>
              <th className="px-4 py-3 text-right">Pagado</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {cuotas && lista.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">No hay cuotas pendientes.</td>
              </tr>
            )}
            {lista.map((c) => {
              const vencida = c.vencimiento < hoy;
              const marcada = sel.has(claveCuota(c));
              return (
                <tr key={claveCuota(c)} className={`border-t border-slate-100 ${marcada ? "bg-emerald-50/50" : ""}`}>
                  <td className="px-4 py-2.5">
                    <input type="checkbox" checked={marcada} onChange={() => toggle(c)} aria-label="Seleccionar cuota" className="h-4 w-4 rounded border-slate-300" />
                  </td>
                  <td className={`px-4 py-2.5 whitespace-nowrap ${vencida ? "font-semibold text-rose-600" : ""}`}>
                    {fechaES(c.vencimiento)}
                    {vencida && <div className="text-[11px]">vencida</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.compra.proveedor_nombre}
                    {c.compra.proveedor_ruc && <div className="font-mono text-[11px] text-slate-400">{c.compra.proveedor_ruc}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/libro-compras/${c.compra_id}`} className="font-mono text-emerald-700 hover:underline">{c.compra.nro_comprobante}</Link>
                    <div className="text-[11px] text-slate-400">{c.compra.tipo_nombre}</div>
                  </td>
                  <td className="px-4 py-2.5">{c.nro}</td>
                  <td className="px-4 py-2.5 text-right">{plata(c.monto, c.compra.moneda)}</td>
                  <td className="px-4 py-2.5 text-right">{plata(c.pagado, c.compra.moneda)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{plata(c.saldo, c.compra.moneda)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setPagar(c)} className="rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
                      Pagar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pagar && (
        <ModalPagoCuota
          compraId={pagar.compra_id}
          cuotaNro={pagar.nro}
          saldo={pagar.saldo}
          moneda={pagar.compra.moneda}
          titulo={`Pagar a ${pagar.compra.proveedor_nombre}`}
          onClose={() => setPagar(null)}
          onDone={(a) => {
            setPagar(null);
            setAviso(a ? `Pago registrado. Ojo: ${a}` : "Pago registrado.");
            void cargar();
          }}
        />
      )}
      {pagarLote && (
        <ModalPagoLote
          items={pagarLote.items}
          moneda={pagarLote.moneda}
          onClose={() => setPagarLote(null)}
          onDone={(r) => {
            setPagarLote(null);
            setSel(new Set());
            const extra = r.avisos.length ? ` Ojo: ${r.avisos.join(" ")}` : "";
            setAviso(`Se pagaron ${r.pagados} cuota${r.pagados === 1 ? "" : "s"}.${extra}`);
            void cargar();
          }}
        />
      )}
    </div>
  );
}
