"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";
import { getProductos, deleteProducto } from "@/lib/inventario/storage";
import type { Producto, MetodoValuacion } from "@/lib/inventario/types";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import ImportExcelButton from "@/components/ui/ImportExcelButton";
import EdgeScrollArea from "@/components/ui/EdgeScrollArea";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import { Select } from "@/components/ui/Select";
import { esInstanciaLR } from "@/lib/inventario/campos-lr";

interface AlmacenOpcion {
  id: string;
  nombre: string;
  es_predeterminado?: boolean;
  activo?: boolean;
}

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none";

const metodoBadge: Record<MetodoValuacion, string> = {
  CPP: "bg-blue-100 text-blue-700",
  FIFO: "bg-green-100 text-green-700",
  LIFO: "bg-purple-100 text-purple-700",
};

function formatGs(valor: number) {
  return `Gs. ${valor.toLocaleString("es-PY")}`;
}

function foldText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Margen sobre venta: (precio − costo) / precio.
 * Devuelve null cuando falta el costo: sin costo cargado el cálculo daría 100%
 * y se leería como un producto rentabilísimo, cuando en realidad no se sabe.
 */
function calcularMargenVenta(costo: number, precio: number): number | null {
  if (precio <= 0 || costo <= 0) return null;
  return ((precio - costo) / precio) * 100;
}

/** Markup sobre costo: (precio − costo) / costo. Es el % que carga el negocio. */
function calcularMarkup(costo: number, precio: number): number | null {
  if (costo <= 0) return null;
  return ((precio - costo) / costo) * 100;
}

function margenBadge(margen: number): string {
  if (margen >= 40) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (margen >= 20) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-red-50 text-red-700 ring-red-200";
}

/** Miniatura del producto; si no hay imagen (o falla), cae a un ícono neutro. */
function ProductoThumb({ url, alt }: { url?: string | null; alt: string }) {
  const [err, setErr] = useState(false);
  if (!url || err) {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-300">
        <ImageIcon className="h-4 w-4" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setErr(true)}
      className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 object-cover"
    />
  );
}

export default function InventarioPage() {
  const { isAdmin } = useIsAdmin();
  const [todos, setTodos] = useState<Producto[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Filtros por columna
  const [filtroPorNombre,  setFiltroPorNombre]  = useState("");
  const [filtroPorSku,     setFiltroPorSku]     = useState("");
  const [filtroPorCosto,   setFiltroPorCosto]   = useState("");
  const [filtroPorPrecio,  setFiltroPorPrecio]  = useState("");
  const [filtroValuacion,  setFiltroValuacion]  = useState<MetodoValuacion | "">("");
  const [filtroUbicacion,  setFiltroUbicacion]  = useState<string>(""); // "", "__sin__" o id
  const [filtroTipo,       setFiltroTipo]       = useState<"todos" | "vendibles" | "insumos" | "mixtos">("todos");
  const [cargandoLista,    setCargandoLista]     = useState(true);
  const [soloStockBajo,    setSoloStockBajo]    = useState(false);
  /** Búsqueda inteligente: matchea nombre + SKU, sin acentos y por palabras sueltas. */
  const [busqueda,         setBusqueda]         = useState("");
  const [filtroCategoria,  setFiltroCategoria]  = useState("");
  const [filtroStock,      setFiltroStock]      = useState<"todos" | "bajo" | "sin" | "con">("todos");
  const [filtroTipoProd,   setFiltroTipoProd]   = useState<"" | "reventa" | "repuesto" | "servicio">("");
  const [categorias,       setCategorias]       = useState<{ id: string; nombre: string }[]>([]);
  const [porPagina,        setPorPagina]        = useState(25);
  const [pagina,           setPagina]           = useState(1);
  const [deletingId,       setDeletingId]       = useState<string | null>(null);

  // ── Selección en bloque (solo Living Room) ──────────────────────────────────
  const usaBloque = esInstanciaLR();
  const [seleccionMode, setSeleccionMode] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [almacenes, setAlmacenes] = useState<AlmacenOpcion[]>([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [observacionBulk, setObservacionBulk] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  function toggleSeleccion(id: string) {
    setSeleccionados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function salirSeleccion() {
    setSeleccionMode(false);
    setSeleccionados(new Set());
    setBulkMsg(null);
  }

  useEffect(() => {
    let cancelled = false;
    setCargandoLista(true);
    getProductos()
      .then((data) => {
        if (!cancelled) setTodos(data);
      })
      .finally(() => {
        if (!cancelled) setCargandoLista(false);
      });
    // Ubicaciones: ya no se consultan (filtro y columna ocultos, una sola sucursal).
    // Categorías para el filtro
    fetch("/api/inventario/categorias", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        setCategorias((j.data?.categorias ?? []) as { id: string; nombre: string }[]);
      })
      .catch(() => undefined);
    // Almacenes de la empresa: para el filtro por almacén y la transferencia en bloque.
    fetch("/api/inventario/ubicaciones", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        const lista: AlmacenOpcion[] = [];
        for (const u of (j.data?.ubicaciones ?? []) as AlmacenOpcion[]) {
          if (u.activo !== false) lista.push({ id: u.id, nombre: u.nombre, es_predeterminado: u.es_predeterminado });
        }
        setAlmacenes(lista);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [refreshKey]);

  async function handleEliminar(id: string, nombre: string) {
    if (deletingId) return;
    if (!window.confirm(`¿Eliminar el producto "${nombre}"? Dejará de aparecer en el inventario.`)) return;
    setDeletingId(id);
    try {
      await deleteProducto(id);
      setTodos((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo eliminar el producto.");
    } finally {
      setDeletingId(null);
    }
  }

  const productos = todos.filter((p) => {
    // Búsqueda inteligente: cada palabra debe aparecer en el nombre o el SKU.
    // Sin acentos y sin importar el orden ("35 aspir" encuentra "Aspiradora … 35 litros").
    const términos = foldText(busqueda).split(/\s+/).filter(Boolean);
    if (términos.length > 0) {
      const heno = `${foldText(p.nombre)} ${foldText(p.sku ?? "")}`;
      if (!términos.every((t) => heno.includes(t))) return false;
    }

    // Tipo de producto (reventa / repuesto / servicio)
    if (filtroTipoProd && (p.tipo_producto ?? "reventa") !== filtroTipoProd) return false;

    // Categoría
    if (filtroCategoria && p.categoria_principal_id !== filtroCategoria) return false;

    // Estado de stock
    if (filtroStock === "sin" && p.stock_actual > 0) return false;
    if (filtroStock === "con" && p.stock_actual <= 0) return false;
    if (filtroStock === "bajo" && !(p.stock_actual <= p.stock_minimo)) return false;

    // Nombre — fold accents/diacritics ("atun" matchea "ATÚN")
    if (filtroPorNombre.trim() !== "" &&
        !foldText(p.nombre).includes(foldText(filtroPorNombre.trim())))
      return false;

    // SKU
    if (filtroPorSku.trim() !== "" &&
        !foldText(p.sku).includes(foldText(filtroPorSku.trim())))
      return false;

    // Costo promedio — acepta "35000" o "35.000"
    if (filtroPorCosto.trim() !== "") {
      const t = filtroPorCosto.trim();
      const coincide =
        String(p.costo_promedio).includes(t) ||
        p.costo_promedio.toLocaleString("es-PY").includes(t);
      if (!coincide) return false;
    }

    // Precio venta — acepta "75000" o "75.000"
    if (filtroPorPrecio.trim() !== "") {
      const t = filtroPorPrecio.trim();
      const coincide =
        String(p.precio_venta).includes(t) ||
        p.precio_venta.toLocaleString("es-PY").includes(t);
      if (!coincide) return false;
    }

    // Valuación
    if (filtroValuacion !== "" && p.metodo_valuacion !== filtroValuacion) return false;

    // Ubicación
    if (filtroUbicacion === "__sin__") {
      if (p.ubicacion_principal_id) return false;
    } else if (filtroUbicacion !== "") {
      if (p.ubicacion_principal_id !== filtroUbicacion) return false;
    }

    // Solo stock bajo
    if (soloStockBajo && p.stock_actual > p.stock_minimo) return false;

    // Tipo gastronómico (vendible/insumo/mixto)
    if (filtroTipo !== "todos") {
      const v = p.es_vendible !== false; // default true si null/undef
      const i = p.es_insumo === true;
      if (filtroTipo === "mixtos" && !(v && i)) return false;
      if (filtroTipo === "vendibles" && !(v && !i)) return false;
      if (filtroTipo === "insumos" && !(i && !v)) return false;
    }

    // Instancia sin separación gastronómica: el listado muestra todos los productos.
    return true;
  });

  // ── Acciones en bloque ──────────────────────────────────────────────────────
  const idsFiltrados = productos.map((p) => p.id);
  const todosFiltradosSeleccionados =
    idsFiltrados.length > 0 && idsFiltrados.every((id) => seleccionados.has(id));

  function toggleTodosFiltrados() {
    setSeleccionados((prev) => {
      const n = new Set(prev);
      if (todosFiltradosSeleccionados) {
        for (const id of idsFiltrados) n.delete(id);
      } else {
        for (const id of idsFiltrados) n.add(id);
      }
      return n;
    });
  }

  async function ejecutarTransferencia() {
    if (procesando) return;
    if (!origenId || !destinoId) { setBulkMsg("Elegí almacén de origen y destino."); return; }
    if (origenId === destinoId) { setBulkMsg("El origen y el destino deben ser distintos."); return; }
    const ids = Array.from(seleccionados);
    if (ids.length === 0) { setBulkMsg("No hay productos seleccionados."); return; }
    setProcesando(true);
    setBulkMsg(null);
    try {
      const r = await fetch("/api/inventario/transferencias/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          producto_ids: ids,
          ubicacion_origen_id: origenId,
          ubicacion_destino_id: destinoId,
          observacion: observacionBulk.trim() || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) { setBulkMsg(j?.error ?? `Error ${r.status}`); return; }
      const d = j.data as { movidos: number; sin_stock: number; errores: number };
      setTransferOpen(false);
      setObservacionBulk("");
      setBulkMsg(
        `Transferencia lista: ${d.movidos} movido(s)` +
          (d.sin_stock ? `, ${d.sin_stock} sin stock en el origen` : "") +
          (d.errores ? `, ${d.errores} con error` : "") + "."
      );
      setSeleccionados(new Set());
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setBulkMsg(e instanceof Error ? e.message : "Error de red al transferir.");
    } finally {
      setProcesando(false);
    }
  }

  async function ejecutarEliminar() {
    if (procesando) return;
    const ids = Array.from(seleccionados);
    if (ids.length === 0) return;
    if (!window.confirm(`¿Eliminar ${ids.length} producto(s) seleccionado(s)? Dejarán de aparecer en el inventario.`)) return;
    setProcesando(true);
    setBulkMsg(null);
    let ok = 0;
    const errores: string[] = [];
    for (const id of ids) {
      try {
        await deleteProducto(id);
        ok++;
      } catch (e) {
        errores.push(e instanceof Error ? e.message : id);
      }
    }
    setTodos((prev) => prev.filter((x) => !(seleccionados.has(x.id) && !errores.includes(x.id))));
    setBulkMsg(`Eliminados: ${ok}${errores.length ? `, ${errores.length} con error` : ""}.`);
    setSeleccionados(new Set());
    setProcesando(false);
    setRefreshKey((k) => k + 1);
  }

  // ── Paginación ────────────────────────────────────────────────────────────
  const totalPaginas = porPagina === 0 ? 1 : Math.max(1, Math.ceil(productos.length / porPagina));
  const paginaActual = Math.min(pagina, totalPaginas);
  const productosPagina =
    porPagina === 0
      ? productos
      : productos.slice((paginaActual - 1) * porPagina, paginaActual * porPagina);
  const desdeItem = productos.length === 0 ? 0 : (paginaActual - 1) * (porPagina || productos.length) + 1;
  const hastaItem = porPagina === 0 ? productos.length : Math.min(paginaActual * porPagina, productos.length);

  const hayFiltrosActivos =
    busqueda || filtroCategoria || filtroStock !== "todos" || filtroTipoProd ||
    filtroPorNombre || filtroPorSku || filtroPorCosto ||
    filtroPorPrecio || filtroValuacion || filtroUbicacion || soloStockBajo ||
    filtroTipo !== "todos";

  function limpiarFiltros() {
    setPagina(1);
    setBusqueda("");
    setFiltroCategoria("");
    setFiltroStock("todos");
    setFiltroTipoProd("");
    setFiltroPorNombre("");
    setFiltroPorSku("");
    setFiltroPorCosto("");
    setFiltroPorPrecio("");
    setFiltroValuacion("");
    setFiltroUbicacion("");
    setSoloStockBajo(false);
    setFiltroTipo("todos");
  }

  return (
    <div className="space-y-8">

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]"
              style={{ boxShadow: "0 0 0 3px rgba(79, 174, 178, 0.18)" }}
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Zentra · Stock
            </p>
          </div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Inventario</h1>
          <p className="mt-0.5 text-xs text-slate-500">Gestión de productos y control de stock</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Link
            href="/inventario/reportes"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Reportes
          </Link>
          <ExportExcelButton url="/api/inventario/productos/export" />
          {/* Actualizar Producto: el Excel solo actualiza datos (SKU bloqueado, no toca stock). */}
          <ImportExcelButton
            entidad="Productos"
            previewUrl="/api/inventario/productos/import/preview"
            commitUrl="/api/inventario/productos/import/commit"
            templateUrl="/api/inventario/productos/import/template"
            modo="actualizar"
            label="Actualizar Producto"
            titulo="Actualizar productos desde Excel"
            visible={isAdmin}
            onCompleted={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      </div>

      <div className="zx-surface zx-surface-accent p-6">

        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-semibold">Productos</h2>
            <Link
              href="/inventario/nuevo"
              className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] active:scale-95"
            >
              Añadir producto
            </Link>
            {usaBloque && (
              <button
                type="button"
                onClick={() => (seleccionMode ? salirSeleccion() : setSeleccionMode(true))}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors active:scale-95 ${
                  seleccionMode
                    ? "border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                    : "border border-[#4FAEB2]/40 bg-white text-[#3F8E91] hover:bg-[#4FAEB2]/5"
                }`}
              >
                {seleccionMode ? "Salir de selección" : "Selección en bloque"}
              </button>
            )}
          </div>
        </div>

        {/* Barra de acciones en bloque */}
        {usaBloque && seleccionMode && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#4FAEB2]/30 bg-[#4FAEB2]/[0.06] px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-700">
              {seleccionados.size} seleccionado(s)
            </span>
            <button
              type="button"
              onClick={toggleTodosFiltrados}
              className="text-xs font-medium text-[#3F8E91] hover:underline"
            >
              {todosFiltradosSeleccionados ? "Quitar todos" : `Seleccionar todos (${productos.length})`}
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                disabled={seleccionados.size === 0 || procesando}
                onClick={() => {
                  setBulkMsg(null);
                  if (!origenId) {
                    const def = almacenes.find((a) => a.es_predeterminado) ?? almacenes[0];
                    if (def) setOrigenId(def.id);
                  }
                  setTransferOpen(true);
                }}
                className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Transferir a almacén
              </button>
              {isAdmin && (
                <button
                  type="button"
                  disabled={seleccionados.size === 0 || procesando}
                  onClick={ejecutarEliminar}
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {procesando ? "Procesando…" : "Eliminar"}
                </button>
              )}
            </div>
          </div>
        )}

        {bulkMsg && (
          <div className="mb-4 rounded-lg border border-[#4FAEB2]/30 bg-[#4FAEB2]/[0.06] px-4 py-2.5 text-sm text-slate-700">
            {bulkMsg}
          </div>
        )}

        {/* Buscador inteligente + filtros útiles */}
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Buscar</label>
            <div className="relative">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder="Nombre o SKU… (ej: «compresor 100» o «INS-0006»)"
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
                className="zx-surface w-full py-2 pl-9 pr-8 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => { setBusqueda(""); setPagina(1); }}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="min-w-[11rem]">
            <label className="mb-1 block text-xs font-medium text-slate-500">Categoría</label>
            <Select
              value={filtroCategoria}
              onChange={(e) => { setFiltroCategoria(e.target.value); setPagina(1); }}
              className="zx-surface w-full px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
            >
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </Select>
          </div>

          <div className="min-w-[10rem]">
            <label className="mb-1 block text-xs font-medium text-slate-500">Tipo</label>
            <Select
              value={filtroTipoProd}
              onChange={(e) => { setFiltroTipoProd(e.target.value as typeof filtroTipoProd); setPagina(1); }}
              className="zx-surface w-full px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
            >
              <option value="">Todos</option>
              <option value="reventa">Reventa</option>
              <option value="repuesto">Repuesto</option>
              <option value="servicio">Servicio</option>
            </Select>
          </div>

          <div className="min-w-[11rem]">
            <label className="mb-1 block text-xs font-medium text-slate-500">Almacén</label>
            {/* Lista los almacenes reales de la empresa: filtra los productos por
                su almacén principal (útil para transferir por lote por almacén). */}
            <Select
              value={filtroUbicacion}
              onChange={(e) => { setFiltroUbicacion(e.target.value); setPagina(1); }}
              className="zx-surface w-full px-3 py-2 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
            >
              <option value="">Todos</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}{a.es_predeterminado ? " (predeterminado)" : ""}
                </option>
              ))}
              <option value="__sin__">Sin almacén</option>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Stock</label>
            <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {([
                { id: "todos", label: "Todos" },
                { id: "con",   label: "Con stock" },
                { id: "bajo",  label: "Bajo" },
                { id: "sin",   label: "Sin stock" },
              ] as const).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { setFiltroStock(o.id); setPagina(1); }}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                    filtroStock === o.id
                      ? "bg-white text-[#3F8E91] shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {hayFiltrosActivos && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
            >
              Limpiar
            </button>
          )}

          <span className="ml-auto text-xs text-slate-500">
            {productos.length === todos.length
              ? `${todos.length} ${todos.length === 1 ? "producto" : "productos"}`
              : `${productos.length} de ${todos.length} ${todos.length === 1 ? "producto" : "productos"}`}
          </span>
        </div>

        {/* Filtros por columna — fila 1 (SKU/Costo/Precio) oculta para UX simplificada */}
        <div className="hidden space-y-3 mb-5 pb-5 border-b border-gray-100">

          {/* Fila 1: filtros de texto por columna */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nombre</label>
              <input
                type="text"
                placeholder="Buscar nombre..."
                value={filtroPorNombre}
                onChange={(e) => setFiltroPorNombre(e.target.value)}
                className={inputFilterClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">SKU</label>
              <input
                type="text"
                placeholder="Buscar SKU..."
                value={filtroPorSku}
                onChange={(e) => setFiltroPorSku(e.target.value)}
                className={inputFilterClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Costo promedio</label>
              <input
                type="text"
                placeholder="Ej: 35000"
                value={filtroPorCosto}
                onChange={(e) => setFiltroPorCosto(e.target.value)}
                className={inputFilterClass}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Precio venta</label>
              <input
                type="text"
                placeholder="Ej: 75000"
                value={filtroPorPrecio}
                onChange={(e) => setFiltroPorPrecio(e.target.value)}
                className={inputFilterClass}
              />
            </div>
          </div>

          {/* Fila 2: valuación, ubicación, stock bajo, limpiar y contador
              Ocultada para instancia Esqueleto ERP — la lógica de filtros sigue activa pero sin UI. */}
          <div className="hidden flex-wrap items-center gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Valuación</label>
              <Select
                value={filtroValuacion}
                onChange={(e) => setFiltroValuacion(e.target.value as MetodoValuacion | "")}
                className={inputFilterClass}
              >
                <option value="">Todos los métodos</option>
                <option value="CPP">CPP</option>
                <option value="FIFO">FIFO</option>
                <option value="LIFO">LIFO</option>
              </Select>
            </div>
            {/* Filtro "Depósito / Ubicación" oculto: una sola sucursal, no aporta.
                El state `filtroUbicacion` queda en "" y no filtra nada. */}
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none mt-4">
              <input
                type="checkbox"
                checked={soloStockBajo}
                onChange={(e) => setSoloStockBajo(e.target.checked)}
                className="rounded"
              />
              Solo stock bajo
            </label>
            <div className="mt-4 flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 p-0.5">
              {(["todos","vendibles","insumos","mixtos"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setFiltroTipo(opt)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition ${
                    filtroTipo === opt
                      ? "bg-white text-amber-700 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {opt === "todos" ? "Todos" : opt[0].toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
            {hayFiltrosActivos && (
              <button
                onClick={limpiarFiltros}
                className="mt-4 text-sm text-gray-400 hover:text-gray-600 transition-colors px-2"
              >
                Limpiar filtros
              </button>
            )}
            <span className="ml-auto text-sm text-gray-400 self-end mb-0.5">
              {productos.length} de {todos.length} productos
            </span>
          </div>

        </div>

        <EdgeScrollArea>
          <table className="w-full text-left text-sm">

            {/* Cabecera fija: al scrollear una lista larga no se pierde la referencia. */}
            <thead className="sticky top-0 z-10">
              <tr className="zx-thead text-[11px] uppercase tracking-wide text-slate-500">
                {usaBloque && seleccionMode && (
                  <th className="py-2.5 pl-4 pr-2 font-semibold">
                    <input
                      type="checkbox"
                      checked={todosFiltradosSeleccionados}
                      onChange={toggleTodosFiltrados}
                      aria-label="Seleccionar todos"
                      className="rounded border-slate-300"
                    />
                  </th>
                )}
                <th className="py-2.5 pl-4 pr-4 font-semibold">Producto</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Costo prom.</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Precio venta</th>
                <th className="py-2.5 pr-4 text-right font-semibold">
                  <span title="(precio − costo) / precio × 100. El markup sobre costo se ve al pasar el mouse.">
                    Margen s/venta
                  </span>
                </th>
                <th className="py-2.5 pr-4 text-right font-semibold">Stock</th>
                {/* Columnas de inventario extendido (Import./Vendido/Show room/Exp. BOL/Saldo)
                    movidas al reporte "Inventario extendido" (botón Reportes). */}
                <th className="w-32 py-2.5 pl-4 pr-4 text-right font-semibold">Acción</th>
              </tr>
            </thead>

            <tbody>
              {productosPagina.map((p) => {
                const stockBajo = p.stock_actual <= p.stock_minimo;
                const sinStock = p.stock_actual <= 0;
                const margen = calcularMargenVenta(p.costo_promedio, p.precio_venta);
                const markup = calcularMarkup(p.costo_promedio, p.precio_venta);
                const sinCosto = p.costo_promedio <= 0;
                return (
                  <tr key={p.id} className={`border-b border-slate-100 last:border-0 transition-colors hover:bg-[#4FAEB2]/[0.05] ${usaBloque && seleccionMode && seleccionados.has(p.id) ? "bg-[#4FAEB2]/[0.07]" : ""}`}>
                    {usaBloque && seleccionMode && (
                      <td className="py-3 pl-4 pr-2 align-middle">
                        <input
                          type="checkbox"
                          checked={seleccionados.has(p.id)}
                          onChange={() => toggleSeleccion(p.id)}
                          aria-label={`Seleccionar ${p.nombre}`}
                          className="rounded border-slate-300"
                        />
                      </td>
                    )}
                    {/* Producto: imagen + nombre + SKU + etiquetas, todo junto */}
                    <td className="py-3 pl-4 pr-4">
                      <div className="flex items-center gap-3">
                        <ProductoThumb url={p.imagen_url} alt={p.nombre} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium leading-snug text-gray-800">{p.nombre}</span>
                            {(() => {
                              const v = p.es_vendible !== false;
                              const i = p.es_insumo === true;
                              // Mixto/Insumo se siguen mostrando; Vendible queda oculto (redundante: ya hay tab).
                              if (v && i) return <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 text-[10px] font-medium px-2 py-0.5">Mixto</span>;
                              if (i) return <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-medium px-2 py-0.5">Insumo</span>;
                              return null;
                            })()}
                          </div>
                          <p className="font-mono text-[11px] text-slate-400">{p.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-gray-700">
                      {sinCosto ? <span className="text-slate-300">—</span> : formatGs(p.costo_promedio)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums font-medium text-gray-800">
                      {formatGs(p.precio_venta)}
                    </td>
                    {/* Margen: sin costo cargado no se puede calcular (no es 100%) */}
                    <td className="py-3 pr-4 text-right">
                      {margen === null ? (
                        <span
                          className="text-xs text-slate-400"
                          title="Falta cargar el costo del producto: sin ese dato no se puede calcular el margen."
                        >
                          Sin costo
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset ${margenBadge(margen)}`}
                          title={markup !== null ? `Equivale a ${markup.toFixed(2)}% de markup sobre el costo` : undefined}
                        >
                          {margen.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    {/* Stock + unidad + mínimo, agrupados en una sola columna */}
                    <td className="py-3 pr-4 text-right">
                      <span className={`text-sm font-semibold tabular-nums ${sinStock ? "text-red-600" : stockBajo ? "text-amber-600" : "text-gray-800"}`}>
                        {p.stock_actual}
                      </span>
                      <span className="ml-1 text-[11px] uppercase text-slate-400">{p.unidad_medida}</span>
                      <p className="text-[11px] text-slate-400">mín. {p.stock_minimo}</p>
                    </td>
                    {/* Columnas de inventario extendido movidas al reporte "Inventario extendido". */}
                    <td className="py-3 pl-4 pr-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          href={`/inventario/${p.id}/editar`}
                          className="zx-surface zx-surface-interactive inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          Editar
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleEliminar(p.id, p.nombre)}
                          disabled={deletingId === p.id}
                          className="inline-flex items-center justify-center rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:border-red-300 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {deletingId === p.id ? "Eliminando…" : "Eliminar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Sin resultados: antes la tabla quedaba en blanco, sin explicación. */}
              {!cargandoLista && productosPagina.length === 0 && (
                <tr>
                  <td colSpan={usaBloque && seleccionMode ? 7 : 6} className="p-4">
                    <div className="zx-empty px-6 py-10 text-center">
                      <p className="text-sm text-slate-500">
                        {todos.length === 0
                          ? "Todavía no cargaste productos."
                          : "Ningún producto coincide con los filtros."}
                      </p>
                      {hayFiltrosActivos && (
                        <button
                          onClick={limpiarFiltros}
                          className="mt-2 text-sm font-medium text-[#3F8E91] hover:underline"
                        >
                          Limpiar filtros
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>

          </table>
        </EdgeScrollArea>

        {/* Paginación */}
        {productos.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Mostrar</span>
              <Select
                value={porPagina}
                onChange={(e) => { setPorPagina(Number(e.target.value)); setPagina(1); }}
                className="zx-surface px-2 py-1.5 text-xs outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
              >
                {[25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
                <option value={0}>Todos</option>
              </Select>
              <span>
                — {desdeItem}‑{hastaItem} de {productos.length}
              </span>
            </div>

            {totalPaginas > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPagina((n) => Math.max(1, n - 1))}
                  disabled={paginaActual === 1}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Anterior
                </button>
                <span className="px-2 text-xs tabular-nums text-slate-500">
                  Página <strong className="text-slate-800">{paginaActual}</strong> de {totalPaginas}
                </span>
                <button
                  type="button"
                  onClick={() => setPagina((n) => Math.min(totalPaginas, n + 1))}
                  disabled={paginaActual === totalPaginas}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Siguiente →
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Modal: transferir seleccionados a otro almacén */}
      {usaBloque && transferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => !procesando && setTransferOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">Transferir a otro almacén</h3>
            <p className="mt-1 text-sm text-slate-500">
              {seleccionados.size} producto(s) seleccionado(s). Se mueve el stock que cada uno
              tenga en el almacén de origen.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Almacén de origen</label>
                <Select
                  value={origenId}
                  onChange={(e) => setOrigenId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Elegir…</option>
                  {almacenes.map((a) => (
                    <option key={a.id} value={a.id}>{a.nombre}{a.es_predeterminado ? " (predeterminado)" : ""}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Almacén de destino</label>
                <Select
                  value={destinoId}
                  onChange={(e) => setDestinoId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Elegir…</option>
                  {almacenes.filter((a) => a.id !== origenId).map((a) => (
                    <option key={a.id} value={a.id}>{a.nombre}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Razón / observación (opcional)</label>
                <input
                  type="text"
                  value={observacionBulk}
                  onChange={(e) => setObservacionBulk(e.target.value)}
                  placeholder="Ej: reubicación de mercadería"
                  maxLength={300}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              {bulkMsg && <p className="text-sm text-red-600">{bulkMsg}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTransferOpen(false)}
                disabled={procesando}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={ejecutarTransferencia}
                disabled={procesando || !origenId || !destinoId}
                className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {procesando ? "Transfiriendo…" : "Transferir"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
