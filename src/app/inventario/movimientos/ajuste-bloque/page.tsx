"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getProductos, saveMovimiento } from "@/lib/inventario/storage";
import type { Producto } from "@/lib/inventario/types";
import { Select } from "@/components/ui/Select";
import { esInstanciaLR } from "@/lib/inventario/campos-lr";

interface AlmacenOpcion {
  id: string;
  nombre: string;
  es_predeterminado?: boolean;
  activo?: boolean;
}

interface Fila {
  producto: Producto;
  ajuste: string; // signed delta como texto
}

/**
 * Ajuste de stock en bloque (Living Room): seleccionar varios productos y aplicar
 * un ajuste manual a cada uno a la vez, en un almacén y con una razón común.
 * Cada fila genera un movimiento de tipo AJUSTE (la cantidad lleva el signo).
 */
export default function AjusteBloquePage() {
  const router = useRouter();
  const usa = esInstanciaLR();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [almacenes, setAlmacenes] = useState<AlmacenOpcion[]>([]);
  const [ubicacionId, setUbicacionId] = useState("");
  const [razon, setRazon] = useState("");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProductos().then((data) => { if (!cancelled) setProductos(data); });
    (async () => {
      try {
        const r = await fetch("/api/inventario/ubicaciones", { credentials: "include", cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.success || cancelled) return;
        const lista = ((j.data?.ubicaciones ?? []) as AlmacenOpcion[]).filter((u) => u.activo !== false);
        setAlmacenes(lista);
        const def = lista.find((u) => u.es_predeterminado) ?? lista[0];
        if (def) setUbicacionId((prev) => prev || def.id);
      } catch { /* sin almacenes */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const yaAgregados = useMemo(() => new Set(filas.map((f) => f.producto.id)), [filas]);

  const sugerencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return productos
      .filter((p) => !yaAgregados.has(p.id))
      .filter((p) => `${p.nombre} ${p.sku}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [busqueda, productos, yaAgregados]);

  function agregar(p: Producto) {
    setFilas((prev) => [...prev, { producto: p, ajuste: "" }]);
    setBusqueda("");
  }
  function quitar(id: string) {
    setFilas((prev) => prev.filter((f) => f.producto.id !== id));
  }
  function setAjuste(id: string, v: string) {
    setFilas((prev) => prev.map((f) => (f.producto.id === id ? { ...f, ajuste: v } : f)));
  }

  const filasValidas = filas.filter((f) => {
    const n = parseFloat(f.ajuste);
    return Number.isFinite(n) && n !== 0;
  });

  async function guardar() {
    if (guardando) return;
    setMsg(null);
    if (filasValidas.length === 0) { setMsg("Agregá al menos un producto con un ajuste distinto de 0."); return; }
    setGuardando(true);
    let ok = 0;
    const errores: string[] = [];
    for (const f of filasValidas) {
      const delta = parseFloat(f.ajuste);
      try {
        const guardado = await saveMovimiento({
          producto_id: f.producto.id,
          producto_nombre: f.producto.nombre,
          producto_sku: f.producto.sku,
          tipo: "AJUSTE",
          cantidad: delta, // AJUSTE: la cantidad lleva el signo
          costo_unitario: f.producto.costo_promedio || 0,
          origen: "ajuste_manual",
          fecha: new Date().toISOString(),
          ...(usa ? { ubicacion_id: ubicacionId || null, observacion: razon.trim() || null } : {}),
        });
        if (guardado) ok++; else errores.push(f.producto.nombre);
      } catch (e) {
        errores.push(`${f.producto.nombre}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    setGuardando(false);
    if (errores.length === 0) {
      router.push("/inventario/movimientos");
    } else {
      setMsg(`Aplicados: ${ok}. Con error: ${errores.length} (${errores.slice(0, 3).join("; ")}${errores.length > 3 ? "…" : ""}).`);
    }
  }

  const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-gray-500 text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-2";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Ajuste en bloque</h1>
          <p className="text-gray-600">Aplicá un ajuste manual de stock a varios productos a la vez.</p>
        </div>
        <Link href="/inventario/movimientos" className="text-sm text-sky-700 hover:text-sky-900 underline">
          ← Volver al historial
        </Link>
      </div>

      <div className="zx-surface p-6 max-w-3xl space-y-6">
        {/* Almacén + Razón comunes */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {usa && (
            <div>
              <label className={labelClass}>Almacén</label>
              <Select value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)} className={inputClass}>
                <option value="">Almacén principal de cada producto</option>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>{a.nombre}{a.es_predeterminado ? " (predeterminado)" : ""}</option>
                ))}
              </Select>
            </div>
          )}
          {usa && (
            <div>
              <label className={labelClass}>Razón <span className="text-xs font-normal text-gray-400">(opcional)</span></label>
              <input
                type="text"
                value={razon}
                onChange={(e) => setRazon(e.target.value)}
                placeholder="Ej: ajuste por conteo físico"
                maxLength={300}
                className={inputClass}
              />
            </div>
          )}
        </div>

        {/* Buscador para agregar productos */}
        <div className="relative">
          <label className={labelClass}>Agregar producto</label>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o SKU…"
            className={inputClass}
          />
          {sugerencias.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              {sugerencias.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregar(p)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-700">{p.nombre}</span>
                  <span className="font-mono text-xs text-slate-400">{p.sku} · stock {p.stock_actual}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tabla de ajustes */}
        {filas.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Stock actual</th>
                  <th className="px-3 py-2 text-right font-medium">Ajuste (+/−)</th>
                  <th className="px-3 py-2 text-right font-medium">Resultante</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const delta = parseFloat(f.ajuste);
                  const resultante = Number.isFinite(delta) ? Math.max(0, f.producto.stock_actual + delta) : f.producto.stock_actual;
                  return (
                    <tr key={f.producto.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-700">{f.producto.nombre}</div>
                        <div className="font-mono text-[11px] text-slate-400">{f.producto.sku}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{f.producto.stock_actual}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="1"
                          value={f.ajuste}
                          onChange={(e) => setAjuste(f.producto.id, e.target.value)}
                          placeholder="Ej: -3 o +5"
                          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-slate-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{resultante}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => quitar(f.producto.id)}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Quitar"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {msg && <p className="text-sm text-red-600">{msg}</p>}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || filasValidas.length === 0}
            className="rounded-lg bg-[#4FAEB2] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardando ? "Aplicando…" : `Aplicar ajuste a ${filasValidas.length} producto(s)`}
          </button>
          <button
            type="button"
            onClick={() => router.push("/inventario/movimientos")}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
