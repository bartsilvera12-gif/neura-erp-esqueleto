"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getGastos, getFacturasGasto, deleteGasto } from "@/lib/gastos/actions";
import { esInstanciaLR } from "@/lib/inventario/campos-lr";
import type { Gasto, FacturaGasto } from "@/lib/gastos/actions";
import { ClipboardList } from "lucide-react";

function formatGs(valor: number) {
  return `${valor.toLocaleString("es-PY")} ₲`;
}

/** Monto con su moneda: las facturas del libro de compras pueden ser USD/BOB. */
function formatMonto(valor: number, moneda: string) {
  if (moneda && moneda !== "PYG") {
    return `${moneda} ${valor.toLocaleString("es-PY", { maximumFractionDigits: 2 })}`;
  }
  return formatGs(valor);
}

/** Fila unificada: un recibo (tabla gastos) o una factura (libro de compras). */
type FilaRecibo = { kind: "recibo"; fechaOrden: string } & Gasto;
type FilaFactura = { kind: "factura"; fechaOrden: string } & FacturaGasto;
type Fila = FilaRecibo | FilaFactura;

function formatFecha(fecha: string) {
  try {
    const d = new Date(fecha);
    return d.toLocaleDateString("es-PY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return fecha;
  }
}

const tipoBadge: Record<string, string> = {
  fijo: "bg-blue-50 text-blue-700",
  variable: "bg-slate-100 text-slate-700",
};

export default function GastosPage() {
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [facturas, setFacturas] = useState<FacturaGasto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [eliminando, setEliminando] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getGastos().catch(() => [] as Gasto[]),
      getFacturasGasto().catch(() => [] as FacturaGasto[]),
    ])
      .then(([g, f]) => {
        setGastos(g);
        setFacturas(f);
      })
      .finally(() => setCargando(false));
  }, []);

  // Recibos (sin factura) + facturas del libro de compras, todo junto por fecha.
  const filas: Fila[] = [
    ...gastos.map((g): FilaRecibo => ({ ...g, kind: "recibo", fechaOrden: (g.fecha || "").slice(0, 10) })),
    ...facturas.map((f): FilaFactura => ({ ...f, kind: "factura", fechaOrden: (f.fecha || "").slice(0, 10) })),
  ].sort((a, b) => b.fechaOrden.localeCompare(a.fechaOrden));

  async function handleEliminar(g: Gasto) {
    if (!confirm(`¿Eliminar el gasto "${g.descripcion || g.categoria || "sin descripción"}"?`)) return;
    setEliminando(g.id);
    try {
      await deleteGasto(g.id);
      setGastos((prev) => prev.filter((x) => x.id !== g.id));
    } catch {
      setEliminando(null);
    } finally {
      setEliminando(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]"
              style={{ boxShadow: "0 0 0 3px rgba(79, 174, 178, 0.18)" }}
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Zentra · Egresos
            </p>
          </div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Gastos operativos</h1>
          <p className="mt-0.5 text-xs text-slate-500">Registro de gastos de la empresa</p>
        </div>
        {esInstanciaLR() ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href="/libro-compras/nuevo"
              title="Registra la factura del gasto (con IVA / crédito fiscal)"
              className="flex items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] active:scale-95"
            >
              <span>+</span>
              Gasto con factura
            </Link>
            <Link
              href="/gastos/nuevo"
              title="Registra el gasto sin factura y genera un Recibo de Gasto"
              className="flex items-center gap-1.5 rounded-lg border border-[#4FAEB2] bg-white px-3 py-1.5 text-xs font-semibold text-[#3F8E91] transition-colors hover:bg-[#4FAEB2]/10 active:scale-95"
            >
              <span>+</span>
              Gasto sin factura
            </Link>
          </div>
        ) : (
          <Link
            href="/gastos/nuevo"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] active:scale-95"
          >
            <span>+</span>
            Nuevo gasto
          </Link>
        )}
      </div>

      <div className="zx-surface zx-surface-accent overflow-hidden">
        {cargando ? (
          <div className="py-16 text-center text-gray-400 text-sm animate-pulse">Cargando gastos…</div>
        ) : filas.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-slate-300" aria-hidden />
            <p className="font-medium text-gray-600">No hay gastos registrados</p>
            <Link
              href="/gastos/nuevo"
              className="mt-4 inline-block text-sm text-[#0EA5E9] hover:underline"
            >
              Registrar primer gasto
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="zx-thead">
                <th className="text-left text-sm font-semibold text-slate-600 px-5 py-3">Fecha</th>
                <th className="text-left text-sm font-semibold text-slate-600 px-5 py-3">Comprobante</th>
                <th className="text-left text-sm font-semibold text-slate-600 px-5 py-3">Categoría</th>
                <th className="text-left text-sm font-semibold text-slate-600 px-5 py-3">Descripción</th>
                <th className="text-left text-sm font-semibold text-slate-600 px-5 py-3">Monto</th>
                <th className="text-left text-sm font-semibold text-slate-600 px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filas.map((fila) =>
                fila.kind === "factura" ? (
                  <tr key={`f-${fila.id}`} className="hover:bg-[#4FAEB2]/[0.04] transition-colors">
                    <td className="px-5 py-3.5 text-sm text-gray-600">{formatFecha(fila.fecha)}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        Factura
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-800">{fila.proveedor || "—"}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 max-w-[220px] truncate">
                      {[fila.tipo_nombre, fila.nro_comprobante ? `N° ${fila.nro_comprobante}` : ""]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-gray-800 tabular-nums">
                      {formatMonto(fila.total, fila.moneda)}
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/libro-compras/${fila.id}`}
                        className="text-xs text-[#3F8E91] hover:text-[#2F6E71] underline"
                      >
                        Ver / Editar
                      </Link>
                    </td>
                  </tr>
                ) : (
                  <tr key={`g-${fila.id}`} className="hover:bg-[#4FAEB2]/[0.04] transition-colors">
                    <td className="px-5 py-3.5 text-sm text-gray-600">{formatFecha(fila.fecha)}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-[#4FAEB2]/15 text-[#2F6E71]">
                        Recibo
                      </span>
                      <span
                        className={`ml-1 inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${tipoBadge[fila.tipo] ?? "bg-slate-100"}`}
                      >
                        {fila.tipo}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-800">{fila.categoria || "—"}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 max-w-[220px] truncate">
                      {fila.descripcion || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-gray-800 tabular-nums">
                      {formatGs(fila.monto)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-2">
                        {esInstanciaLR() && fila.facturado === false && (
                          <a
                            href={`/api/gastos/${fila.id}/recibo?auto=1`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[#3F8E91] hover:text-[#2F6E71] underline"
                          >
                            Recibo
                          </a>
                        )}
                        <Link
                          href={`/gastos/${fila.id}/editar`}
                          className="text-xs text-gray-500 hover:text-gray-800 underline"
                        >
                          Editar
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleEliminar(fila)}
                          disabled={eliminando === fila.id}
                          className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-50"
                        >
                          {eliminando === fila.id ? "…" : "Eliminar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>

      {filas.length > 0 && (
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-800">{filas.length}</span> registros
          {facturas.length > 0 && (
            <>
              {" "}
              · {gastos.length} recibo{gastos.length === 1 ? "" : "s"} · {facturas.length} factura
              {facturas.length === 1 ? "" : "s"}
            </>
          )}
        </p>
      )}
    </div>
  );
}
