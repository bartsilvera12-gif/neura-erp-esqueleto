"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import ProductoBuscador, { type ProductoLista } from "@/app/importaciones/_components/ProductoBuscador";

/** Un movimiento tal como lo devuelve /api/inventario/movimientos. */
interface Mov {
  id: string;
  tipo: "ENTRADA" | "SALIDA" | "AJUSTE";
  cantidad: number;
  costo_unitario: number;
  origen: string;
  referencia: string | null;
  fecha: string;
  usuario_nombre?: string | null;
}

/** Una fila del kardex ya con saldos acumulados. */
interface Fila extends Mov {
  entrada: number;
  salida: number;
  saldoCant: number;
  valorMov: number;
  saldoValor: number;
  cpp: number;
}

const origenLabel: Record<string, string> = {
  compra: "Compra",
  venta: "Venta",
  ajuste_manual: "Ajuste manual",
  inventario_inicial: "Inventario inicial",
  transferencia: "Transferencia",
  importacion: "Importación",
};

const gs = (n: number) => `Gs. ${Math.round(Number(n) || 0).toLocaleString("es-PY")}`;
const num = (n: number) => Number(n || 0).toLocaleString("es-PY", { maximumFractionDigits: 2 });

function fechaCorta(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Kardex físico valorado de un producto: entradas y salidas en orden
 * cronológico con saldo de cantidad y valor acumulado (costo promedio
 * ponderado). Las salidas se valorizan al costo promedio del momento.
 */
function KardexContenido() {
  const sp = useSearchParams();
  const [producto, setProducto] = useState<ProductoLista | null>(null);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (prodId: string) => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/inventario/movimientos?producto_id=${encodeURIComponent(prodId)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) {
        setError(j?.error ?? `Error ${r.status}`);
        setMovs([]);
        return;
      }
      setMovs((j.data?.movimientos ?? []) as Mov[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, []);

  // Deep-link: /inventario/kardex?producto_id=...&nombre=...&sku=...
  useEffect(() => {
    const id = sp.get("producto_id");
    if (id && !producto) {
      setProducto({ id, nombre: sp.get("nombre") ?? "Producto", sku: sp.get("sku") });
      void cargar(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegir(p: ProductoLista) {
    setProducto(p);
    void cargar(p.id);
  }

  // Acumula saldo de cantidad y valor (CPP). Las salidas usan el costo promedio
  // del momento; las entradas, el costo del movimiento.
  const filas = useMemo<Fila[]>(() => {
    let saldoCant = 0;
    let saldoValor = 0;
    return movs.map((m) => {
      const cant = Number(m.cantidad) || 0;
      const costo = Number(m.costo_unitario) || 0;
      const entra = m.tipo === "ENTRADA" || (m.tipo === "AJUSTE" && cant >= 0);
      const deltaCant = entra ? Math.abs(cant) : -Math.abs(cant);
      const cppPrevio = saldoCant > 0 ? saldoValor / saldoCant : 0;
      let valorMov: number;
      if (entra) {
        valorMov = Math.abs(cant) * costo;
      } else {
        // Salida valorizada al costo promedio del momento.
        valorMov = -Math.abs(cant) * cppPrevio;
      }
      saldoCant += deltaCant;
      saldoValor += valorMov;
      if (saldoCant <= 0) saldoValor = 0; // sin stock no hay valor que arrastrar
      const cpp = saldoCant > 0 ? saldoValor / saldoCant : 0;
      return {
        ...m,
        entrada: entra ? Math.abs(cant) : 0,
        salida: entra ? 0 : Math.abs(cant),
        saldoCant,
        valorMov,
        saldoValor,
        cpp,
      };
    });
  }, [movs]);

  const ultima = filas[filas.length - 1];

  return (
    <div className="space-y-5">
      <div>
        <nav className="mb-1 text-xs text-slate-500">
          <Link href="/inventario/movimientos" className="inline-flex items-center gap-1 hover:text-[#3F8E91]">
            <ArrowLeft className="h-3.5 w-3.5" /> Movimientos
          </Link>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Kardex valorado</h1>
        <p className="mt-1 text-sm text-slate-500">Entradas y salidas de un producto con saldo de cantidad y valor acumulado (costo promedio).</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-semibold text-slate-500">Producto</label>
        <div className="mt-1 max-w-xl">
          <ProductoBuscador valor={producto} onElegir={elegir} autoFocus={!producto} />
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {producto && (
        <>
          {/* Resumen */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saldo en stock</p>
              <p className="text-xl font-semibold text-slate-900">{num(ultima?.saldoCant ?? 0)} u.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Costo promedio</p>
              <p className="text-xl font-semibold text-slate-900">{gs(ultima?.cpp ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Valor del stock</p>
              <p className="text-xl font-semibold text-emerald-900">{gs(ultima?.saldoValor ?? 0)}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[920px] text-xs">
              <thead className="border-b bg-slate-50 uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2 text-left">Fecha</th>
                  <th className="px-2 py-2 text-left">Origen</th>
                  <th className="px-2 py-2 text-left">Referencia</th>
                  <th className="px-2 py-2 text-right">Entrada</th>
                  <th className="px-2 py-2 text-right">Salida</th>
                  <th className="px-2 py-2 text-right">Saldo</th>
                  <th className="px-2 py-2 text-right">Costo unit.</th>
                  <th className="px-2 py-2 text-right">Valor mov.</th>
                  <th className="px-2 py-2 text-right">Saldo valor</th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr><td colSpan={9} className="px-2 py-8 text-center text-slate-400">Cargando…</td></tr>
                ) : filas.length === 0 ? (
                  <tr><td colSpan={9} className="px-2 py-8 text-center text-slate-400">Este producto no tiene movimientos.</td></tr>
                ) : (
                  filas.map((f) => (
                    <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">{fechaCorta(f.fecha)}</td>
                      <td className="px-2 py-1.5">
                        <span className="inline-flex rounded-full bg-[#4FAEB2]/10 px-2 py-0.5 text-[11px] font-medium text-[#2F6E71] ring-1 ring-[#4FAEB2]/30">
                          {origenLabel[f.origen] ?? f.origen}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-slate-600">{f.referencia ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[#3F8E91]">{f.entrada ? num(f.entrada) : ""}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{f.salida ? num(f.salida) : ""}</td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-slate-800">{num(f.saldoCant)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{gs(f.costo_unitario)}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${f.valorMov < 0 ? "text-slate-500" : "text-[#3F8E91]"}`}>{gs(f.valorMov)}</td>
                      <td className="px-2 py-1.5 text-right font-medium tabular-nums text-slate-800">{gs(f.saldoValor)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            Las salidas se valorizan al costo promedio del momento. El costo de los ingresos por importación se estampa al aplicar el costeo.
          </p>
        </>
      )}
    </div>
  );
}

export default function KardexPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
      <KardexContenido />
    </Suspense>
  );
}
