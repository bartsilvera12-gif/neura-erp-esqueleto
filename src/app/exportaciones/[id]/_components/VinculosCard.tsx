"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText, Truck } from "lucide-react";
import type { Exportacion, VinculoFactura, VinculoRemision } from "@/lib/exportaciones/types";
import { Aviso, api, btnSecundario, fechaES, inputClass, jsonInit } from "@/components/comex/ui";

const money = (v: number, m: string) => `${m === "PYG" ? "Gs." : m} ${Number(v).toLocaleString("es-PY", { maximumFractionDigits: 2 })}`;
const ESTADO_NR: Record<string, string> = { pendiente: "Pendiente de aprobación", aprobada: "Aprobada", rechazada: "Rechazada" };

/** La factura de exportación y la nota de remisión del envío, para verlas juntas. */
export default function VinculosCard({
  exp,
  factura,
  remision,
  onCambio,
}: {
  exp: Exportacion;
  factura: VinculoFactura | null;
  remision: VinculoRemision | null;
  onCambio: () => void;
}) {
  const [opciones, setOpciones] = useState<{ facturas: VinculoFactura[]; remisiones: VinculoRemision[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState<{ factura: string; remision: string }>({ factura: "", remision: "" });
  // Se puede cambiar el vínculo hasta aprobar el despacho (la nota de remisión, hasta despachar).
  const puedeFactura = exp.estado === "preparacion" || exp.estado === "documentacion";
  const puedeRemision = puedeFactura || exp.estado === "aprobada";

  useEffect(() => {
    if (!puedeRemision) return;
    api<{ facturas: VinculoFactura[]; remisiones: VinculoRemision[] }>(`/api/exportaciones/opciones?exportacion_id=${exp.id}`)
      .then(setOpciones)
      .catch(() => undefined);
  }, [exp.id, puedeRemision, factura?.id, remision?.id]);

  async function vincular(campo: "factura_id" | "nota_remision_id", valor: string | null) {
    setError(null);
    try {
      await api(`/api/exportaciones/${exp.id}`, jsonInit("PATCH", { [campo]: valor }));
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setEligiendo({ factura: "", remision: "" });
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-3 md:grid-cols-2">
        {/* Factura */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <FileText className="h-4 w-4" /> Factura de exportación
          </p>
          {factura ? (
            <div className="mt-2 space-y-1 text-sm">
              <p className="font-mono font-semibold text-slate-900">
                {factura.numero_formateado ?? "—"}
                {factura.prueba && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-amber-800">PRUEBA</span>}
                {factura.estado !== "EMITIDA" && <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-rose-700">{factura.estado}</span>}
              </p>
              <p className="text-slate-600">
                {fechaES(factura.fecha)} · {factura.cliente_nombre} · {money(factura.total, factura.moneda)}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <a href={`/api/facturas-exportacion/${factura.id}/pdf`} target="_blank" rel="noopener" className={btnSecundario}>
                  Imprimir
                </a>
                {puedeFactura && (
                  <button onClick={() => void vincular("factura_id", null)} className={`${btnSecundario} text-rose-600`}>
                    Quitar vínculo
                  </button>
                )}
              </div>
            </div>
          ) : puedeFactura ? (
            <div className="mt-2 space-y-2">
              <select
                value={eligiendo.factura}
                onChange={(e) => {
                  setEligiendo({ ...eligiendo, factura: e.target.value });
                  if (e.target.value) void vincular("factura_id", e.target.value);
                }}
                className={inputClass}
              >
                <option value="">— Elegir una factura emitida —</option>
                {opciones?.facturas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.numero_formateado} · {f.cliente_nombre} · {money(f.total, f.moneda)}
                    {f.prueba ? " · PRUEBA" : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                ¿Todavía no está hecha?{" "}
                <Link href="/facturas-exportacion/nueva?tipo=EXPORTACION" className="font-medium text-emerald-700 hover:underline">
                  Hacer la factura
                </Link>{" "}
                y después vinculala acá.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Sin factura vinculada.</p>
          )}
        </div>

        {/* Nota de remisión */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Truck className="h-4 w-4" /> Nota de remisión
          </p>
          {remision ? (
            <div className="mt-2 space-y-1 text-sm">
              <p className="font-mono font-semibold text-slate-900">{remision.numero ?? "—"}</p>
              <p className="text-slate-600">
                {fechaES(remision.fecha)} · {remision.destino_nombre ?? "—"} · {ESTADO_NR[remision.estado] ?? remision.estado}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href={`/notas-remision/${remision.id}/documento`} target="_blank" className={btnSecundario}>
                  Ver / imprimir
                </Link>
                {puedeRemision && (
                  <button onClick={() => void vincular("nota_remision_id", null)} className={`${btnSecundario} text-rose-600`}>
                    Quitar vínculo
                  </button>
                )}
              </div>
            </div>
          ) : puedeRemision ? (
            <div className="mt-2 space-y-2">
              <select
                value={eligiendo.remision}
                onChange={(e) => {
                  setEligiendo({ ...eligiendo, remision: e.target.value });
                  if (e.target.value) void vincular("nota_remision_id", e.target.value);
                }}
                className={inputClass}
              >
                <option value="">— Elegir una nota de remisión —</option>
                {opciones?.remisiones.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.numero ?? "s/n"} · {fechaES(n.fecha)} · {n.destino_nombre ?? "—"}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                ¿Todavía no está hecha?{" "}
                <Link href="/notas-remision/nueva" className="font-medium text-emerald-700 hover:underline">
                  Hacer la nota de remisión
                </Link>{" "}
                y después vinculala acá.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Sin nota de remisión vinculada.</p>
          )}
        </div>
      </div>
      {error && <Aviso>{error}</Aviso>}
    </div>
  );
}
