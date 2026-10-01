"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { fetchStockDeposito, type StockItem } from "@/lib/multideposito/client";

/**
 * Qué hay en un depósito. Es el stock por depósito que mueven las compras, las
 * ventas, las importaciones, las transferencias y las remisiones.
 */
export default function StockDepositoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [deposito, setDeposito] = useState<{ nombre: string; codigo: string } | null>(null);
  const [items, setItems] = useState<StockItem[]>([]);
  const [soloConStock, setSoloConStock] = useState(true);
  const [buscar, setBuscar] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await fetchStockDeposito(id, { soloConStock });
    if (r.ok) {
      setDeposito(r.data.deposito);
      setItems(r.data.items);
      setError(null);
    } else {
      setError(r.error);
    }
    setCargando(false);
  }, [id, soloConStock]);
  useEffect(() => { void cargar(); }, [cargar]);

  const q = buscar.trim().toLowerCase();
  const lista = q ? items.filter((i) => `${i.nombre} ${i.sku}`.toLowerCase().includes(q)) : items;
  const total = lista.reduce((s, i) => s + Number(i.stock || 0), 0);
  const cant = (n: number) => Number(n || 0).toLocaleString("es-PY", { maximumFractionDigits: 3 });

  return (
    <div className="space-y-5">
      <Link href="/inventario/ubicaciones" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Depósitos / Ubicaciones
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Qué hay en el depósito</p>
          <h1 className="text-2xl font-semibold text-slate-900">{deposito?.nombre ?? "…"}</h1>
          <p className="text-sm text-slate-500">{deposito?.codigo}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase text-slate-500">Unidades en total</p>
          <p className="text-3xl font-semibold text-slate-900 tabular-nums">{cant(total)}</p>
          <p className="text-xs text-slate-500">{lista.length} producto(s)</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar producto por nombre o código…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-400"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={soloConStock}
            onChange={(e) => setSoloConStock(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Mostrar solo los que tienen stock acá
        </label>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Unidad</th>
              <th className="px-4 py-3 text-right">Stock acá</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">Cargando…</td></tr>
            )}
            {!cargando && lista.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                {soloConStock ? "No hay productos con stock en este depósito." : "No hay productos."}
              </td></tr>
            )}
            {lista.map((i) => (
              <tr key={i.producto_id} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{i.sku || "—"}</td>
                <td className="px-4 py-2.5 text-slate-800">{i.nombre}</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{i.unidad}</td>
                <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${Number(i.stock) > 0 ? "text-slate-900" : "text-slate-400"}`}>
                  {cant(i.stock)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
