"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { inputClass } from "@/components/comex/ui";

export interface ProductoLista {
  id: string;
  nombre: string;
  sku: string | null;
  costo_promedio?: number | null;
}

/** Buscador de productos del inventario (por nombre o código). */
export default function ProductoBuscador({
  valor,
  onElegir,
  autoFocus,
}: {
  valor: ProductoLista | null;
  onElegir: (p: ProductoLista) => void;
  autoFocus?: boolean;
}) {
  const [productos, setProductos] = useState<ProductoLista[]>([]);
  const [texto, setTexto] = useState(valor?.nombre ?? "");
  const [abierto, setAbierto] = useState(false);

  // Se pide cada vez que se abre, así aparecen los productos recién creados.
  useEffect(() => {
    fetchWithSupabaseSession("/api/productos", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setProductos((j?.data?.productos ?? []) as ProductoLista[]))
      .catch(() => undefined);
  }, []);

  const filtrados = useMemo(() => {
    const t = texto.trim().toLowerCase();
    const base = t ? productos.filter((p) => p.nombre.toLowerCase().includes(t) || (p.sku ?? "").toLowerCase().includes(t)) : productos;
    return base.slice(0, 30);
  }, [productos, texto]);

  return (
    <div className="relative">
      <input
        value={texto}
        autoFocus={autoFocus}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Buscá por nombre o código…"
        className={inputClass}
      />
      {abierto && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtrados.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">No hay productos con ese nombre en el inventario.</p>}
          {filtrados.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onElegir(p);
                setTexto(p.nombre);
                setAbierto(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"
            >
              <span className="font-medium text-slate-800">{p.nombre}</span>
              {p.sku && <span className="ml-2 font-mono text-xs text-slate-400">{p.sku}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
