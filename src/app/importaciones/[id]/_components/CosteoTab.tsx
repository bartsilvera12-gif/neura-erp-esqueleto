"use client";

import { useCallback, useEffect, useState } from "react";
import { Calculator } from "lucide-react";
import ConfirmModal from "@/components/ui/ConfirmModal";
import type { FilaCosteo, Prorrateo } from "@/lib/comex/costeo";
import { Aviso, api, btnPrimario, btnSecundario, inputClass, jsonInit, labelClass, noRueda, sinFlechas } from "@/components/comex/ui";

const gs = (n: number) => `Gs. ${Math.round(Number(n) || 0).toLocaleString("es-PY")}`;

type Respuesta = {
  filas: FilaCosteo[];
  totalMercaderiaGs: number;
  totalGastosGs: number;
  totalGs: number;
  moneda: string;
  tipo_cambio: number;
  prorrateo: Prorrateo;
  cerrada: boolean;
};

/**
 * Costo real de la mercadería: lo que facturó el proveedor más los gastos de
 * la importación repartidos entre los productos. Desde acá ese costo se pasa
 * al inventario, que es lo que después usan los márgenes y los precios.
 */
export default function CosteoTab({ impId, bloqueado, onCambio }: { impId: string; bloqueado?: boolean; onCambio?: () => void }) {
  const [d, setD] = useState<Respuesta | null>(null);
  const [cambio, setCambio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await api<Respuesta>(`/api/importaciones/${impId}/costeo`);
      setD(r);
      setCambio(String(r.tipo_cambio));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [impId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar(cuerpo: Record<string, unknown>) {
    setError(null);
    try {
      await api(`/api/importaciones/${impId}/costeo`, jsonInit("PATCH", cuerpo));
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function aplicar() {
    setGuardando(true);
    setError(null);
    try {
      const r = await api<{ aplicados: number; sin_producto: string[] }>(`/api/importaciones/${impId}/costeo`, jsonInit("POST", {}));
      setAviso(
        `Costo aplicado a ${r.aplicados} producto(s) del inventario.` +
          (r.sin_producto.length ? ` ${r.sin_producto.length} línea(s) no están vinculadas a un producto y quedaron sin aplicar.` : "")
      );
      setConfirmar(false);
      await cargar();
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setConfirmar(false);
    } finally {
      setGuardando(false);
    }
  }

  if (!d) return <p className="text-sm text-slate-500">Cargando…</p>;

  const soloLectura = bloqueado || d.cerrada;
  const sinPrecios = d.totalMercaderiaGs === 0;
  const cambioFaltante = d.moneda !== "PYG" && d.tipo_cambio <= 1;

  return (
    <section className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className={labelClass}>Mercadería</p>
          <p className="text-xl font-semibold text-slate-900">{gs(d.totalMercaderiaGs)}</p>
          <p className="text-xs text-slate-500">Lo que facturó el proveedor</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className={labelClass}>Gastos</p>
          <p className="text-xl font-semibold text-slate-900">{gs(d.totalGastosGs)}</p>
          <p className="text-xs text-slate-500">Flete, seguro, despachante, tributos…</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className={labelClass}>Costo total</p>
          <p className="text-xl font-semibold text-emerald-900">{gs(d.totalGs)}</p>
          <p className="text-xs text-emerald-800">Mercadería puesta en el depósito</p>
        </div>
      </div>

      {error && <Aviso>{error}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      {sinPrecios && (
        <Aviso tipo="info">
          Los ítems no tienen precio cargado, así que no hay sobre qué repartir los gastos. Cargá el precio del proveedor en la
          pestaña <strong>Mercadería</strong>.
        </Aviso>
      )}
      {cambioFaltante && (
        <Aviso tipo="info">
          La importación está en {d.moneda} y el tipo de cambio es {d.tipo_cambio}. Cargá el cambio del día para que los montos en
          guaraníes sean reales.
        </Aviso>
      )}

      {/* Cómo se calcula */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className={labelClass}>Tipo de cambio a Gs.</label>
          <input
            type="number"
            min="0"
            step="any"
            value={cambio}
            disabled={soloLectura}
            onWheel={noRueda}
            onChange={(e) => setCambio(e.target.value)}
            onBlur={() => Number(cambio) > 0 && Number(cambio) !== d.tipo_cambio && void guardar({ tipo_cambio: Number(cambio) })}
            className={`${inputClass} ${sinFlechas} w-36`}
          />
        </div>
        <div>
          <label className={labelClass}>Repartir los gastos</label>
          <select
            value={d.prorrateo}
            disabled={soloLectura}
            onChange={(e) => void guardar({ prorrateo: e.target.value })}
            className={`${inputClass} w-56`}
          >
            <option value="valor">Por valor (lo más caro absorbe más)</option>
            <option value="cantidad">Por cantidad (todas las unidades igual)</option>
          </select>
        </div>
        {!soloLectura && (
          <button type="button" onClick={() => setConfirmar(true)} disabled={!d.filas.length} className={btnPrimario}>
            <Calculator className="h-3.5 w-3.5" /> Aplicar al inventario
          </button>
        )}
        <button type="button" onClick={() => void cargar()} className={btnSecundario}>
          Recalcular
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Producto</th>
              <th className="px-4 py-2 text-right">Cantidad</th>
              <th className="px-4 py-2 text-right">Proveedor</th>
              <th className="px-4 py-2 text-right">Gastos</th>
              <th className="px-4 py-2 text-right">Costo total</th>
              <th className="px-4 py-2 text-right">Costo unitario</th>
              <th className="px-4 py-2">Inventario</th>
            </tr>
          </thead>
          <tbody>
            {d.filas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                  Esta importación no tiene productos cargados.
                </td>
              </tr>
            )}
            {d.filas.map((f) => (
              <tr key={f.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <span className="font-medium text-slate-800">{f.producto_nombre}</span>
                  {f.sku && <span className="block font-mono text-[11px] text-slate-500">{f.sku}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-slate-700">{Number(f.cantidad).toLocaleString("es-PY")}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-slate-700">{gs(f.subtotal_gs)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-slate-700">{gs(f.gastos_gs)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-slate-700">{gs(f.total_gs)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-semibold text-slate-900">{gs(f.costo_unitario_gs)}</td>
                <td className="px-4 py-2 text-xs">
                  {!f.producto_id ? (
                    <span className="text-amber-700">Sin vincular</span>
                  ) : f.costo_aplicado_at ? (
                    <span className="text-emerald-700">Aplicado</span>
                  ) : (
                    <span className="text-slate-400">Sin aplicar</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={confirmar}
        title="Aplicar el costo al inventario"
        message="Cada producto de esta importación va a quedar con el costo unitario calculado acá, reemplazando el que tenga hoy. Afecta los márgenes y los informes. ¿Seguimos?"
        confirmLabel={guardando ? "Aplicando…" : "Aplicar"}
        onConfirm={() => void aplicar()}
        onCancel={() => setConfirmar(false)}
      />
    </section>
  );
}
