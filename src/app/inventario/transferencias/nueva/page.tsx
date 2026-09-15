"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getProductos } from "@/lib/inventario/storage";
import type { Producto } from "@/lib/inventario/types";

type Ubicacion = { id: string; nombre: string; codigo?: string | null };

export default function NuevaTransferenciaPage() {
  const router = useRouter();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [productoId, setProductoId] = useState("");
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [cantidad, setCantidad] = useState<string>("");
  const [observacion, setObservacion] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    async function cargar() {
      try {
        const [prods, rUbic] = await Promise.all([
          getProductos(),
          fetch("/api/inventario/ubicaciones", { credentials: "include", cache: "no-store" }),
        ]);
        const jUbic = await rUbic.json();
        if (cancel) return;
        if (!rUbic.ok) throw new Error(jUbic?.error ?? "Error cargando depósitos");
        setProductos(prods);
        setUbicaciones((jUbic.data?.ubicaciones ?? []) as Ubicacion[]);
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : "Error inesperado");
      }
    }
    cargar();
    return () => {
      cancel = true;
    };
  }, []);

  const productoSel = useMemo(
    () => productos.find((p) => p.id === productoId) ?? null,
    [productos, productoId],
  );

  const puedeGuardar =
    !!productoId &&
    !!origenId &&
    !!destinoId &&
    origenId !== destinoId &&
    Number(cantidad) > 0 &&
    !saving;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeGuardar) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/inventario/transferencias", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          producto_id: productoId,
          cantidad: Number(cantidad),
          ubicacion_origen_id: origenId,
          ubicacion_destino_id: destinoId,
          observacion: observacion.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "No se pudo transferir");
      router.push("/inventario/transferencias");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/inventario/transferencias"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Transferencias
      </Link>

      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Zentra · Inventario
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">Nueva transferencia</h1>
        <p className="text-sm text-slate-600">
          Descuenta stock del depósito de origen y lo suma al de destino en una sola operación.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Producto
          </label>
          <select
            value={productoId}
            onChange={(e) => setProductoId(e.target.value)}
            className={inputClass}
            required
          >
            <option value="">Seleccionar…</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} · {p.sku}
              </option>
            ))}
          </select>
          {productoSel && (
            <p className="mt-1 text-xs text-slate-500">
              Stock total actual: {Number(productoSel.stock_actual).toLocaleString("es-PY")}{" "}
              {productoSel.unidad_medida}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Depósito origen
            </label>
            <select
              value={origenId}
              onChange={(e) => setOrigenId(e.target.value)}
              className={inputClass}
              required
            >
              <option value="">Seleccionar…</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="hidden pb-2 text-slate-400 sm:block">
            <ArrowRight className="h-5 w-5" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Depósito destino
            </label>
            <select
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
              className={inputClass}
              required
            >
              <option value="">Seleccionar…</option>
              {ubicaciones
                .filter((u) => u.id !== origenId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Cantidad
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Observación (opcional)
          </label>
          <textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            rows={2}
            className={inputClass}
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/inventario/transferencias"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={!puedeGuardar}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Transfiriendo…" : "Transferir"}
          </button>
        </div>
      </form>
    </div>
  );
}
