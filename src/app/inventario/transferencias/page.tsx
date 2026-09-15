"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Plus, Truck } from "lucide-react";

type Ubicacion = { id: string; nombre: string };

type Transferencia = {
  transferencia_id: string;
  referencia: string | null;
  fecha: string;
  producto_id: string;
  producto_nombre: string;
  producto_sku: string;
  cantidad: number;
  ubicacion_origen_id: string | null;
  ubicacion_destino_id: string | null;
  observacion: string | null;
  usuario_nombre: string | null;
};

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-PY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function TransferenciasPage() {
  const [rows, setRows] = useState<Transferencia[]>([]);
  const [ubicNombre, setUbicNombre] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    async function cargar() {
      try {
        const [rTransf, rUbic] = await Promise.all([
          fetch("/api/inventario/transferencias", { credentials: "include", cache: "no-store" }),
          fetch("/api/inventario/ubicaciones", { credentials: "include", cache: "no-store" }),
        ]);
        const jTransf = await rTransf.json();
        const jUbic = await rUbic.json();
        if (cancel) return;
        if (!rTransf.ok) throw new Error(jTransf?.error ?? "Error cargando transferencias");
        if (!rUbic.ok) throw new Error(jUbic?.error ?? "Error cargando depósitos");

        const map: Record<string, string> = {};
        for (const u of (jUbic.data?.ubicaciones ?? []) as Ubicacion[]) {
          map[u.id] = u.nombre;
        }
        setUbicNombre(map);
        setRows((jTransf.data?.transferencias ?? []) as Transferencia[]);
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : "Error inesperado");
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    cargar();
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Zentra · Inventario
          </p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Truck className="h-6 w-6 text-slate-500" /> Transferencias entre depósitos
          </h1>
          <p className="text-sm text-slate-600">
            Movimientos internos de stock entre depósitos propios. Descuenta del origen y suma al destino
            en una sola operación.
          </p>
        </div>
        <Link
          href="/inventario/transferencias/nueva"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> Nueva transferencia
        </Link>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Referencia</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3 text-right">Cantidad</th>
              <th className="px-4 py-3">Origen</th>
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3">Destino</th>
              <th className="px-4 py-3">Usuario</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No hay transferencias registradas.
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={t.transferencia_id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-700">{formatFecha(t.fecha)}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{t.referencia ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{t.producto_nombre}</div>
                  <div className="text-xs text-slate-500">{t.producto_sku}</div>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">
                  {Number(t.cantidad).toLocaleString("es-PY")}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {t.ubicacion_origen_id ? ubicNombre[t.ubicacion_origen_id] ?? t.ubicacion_origen_id : "—"}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  <ArrowRight className="h-4 w-4" />
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {t.ubicacion_destino_id
                    ? ubicNombre[t.ubicacion_destino_id] ?? t.ubicacion_destino_id
                    : "—"}
                </td>
                <td className="px-4 py-3 text-slate-500">{t.usuario_nombre ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
