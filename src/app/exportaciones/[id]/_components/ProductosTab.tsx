"use client";

import { useState } from "react";
import { Copy, Plus } from "lucide-react";
import ConfirmModal from "@/components/ui/ConfirmModal";
import type { Exportacion, ExportacionItem } from "@/lib/exportaciones/types";
import type { Contenedor } from "@/lib/comex/types";
import ProductoBuscador, { type ProductoLista } from "@/app/importaciones/_components/ProductoBuscador";
import { Aviso, ModalShell, api, btnPrimario, btnSecundario, inputClass, jsonInit, labelClass, noRueda, sinFlechas } from "@/components/comex/ui";

const cant = (v: number) => Number(v).toLocaleString("es-PY");

export default function ProductosTab({
  exp,
  items,
  contenedores,
  onCambio,
}: {
  exp: Exportacion;
  items: ExportacionItem[];
  contenedores: Contenedor[];
  onCambio: () => void;
}) {
  const editable = exp.estado === "preparacion";
  const asignaContenedor = editable || exp.estado === "documentacion";
  const [modal, setModal] = useState<ExportacionItem | "nuevo" | null>(null);
  const [quitar, setQuitar] = useState<ExportacionItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiando, setCopiando] = useState(false);
  const contNumero = new Map(contenedores.map((c) => [c.id, c.numero]));

  async function copiarDeFactura() {
    setCopiando(true);
    setError(null);
    setAviso(null);
    try {
      const d = await api<{ copiados: number; sin_producto: string[] }>(`/api/exportaciones/${exp.id}/items/desde-factura`, { method: "POST" });
      setAviso(
        `Se copiaron ${d.copiados} producto(s) de la factura.` +
          (d.sin_producto.length ? ` No se copiaron (no están en el inventario): ${d.sin_producto.join(", ")}.` : "")
      );
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCopiando(false);
    }
  }

  async function cambiarContenedor(it: ExportacionItem, contenedorId: string) {
    setError(null);
    try {
      await api(`/api/exportaciones/${exp.id}/items/${it.id}`, jsonInit("PATCH", { contenedor_id: contenedorId || null }));
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function confirmarQuitar() {
    if (!quitar) return;
    try {
      await api(`/api/exportaciones/${exp.id}/items/${quitar.id}`, { method: "DELETE" });
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
    setQuitar(null);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {editable ? "Productos que salen en este envío." : "Los productos se cambian solo en preparación."}
        </p>
        {editable && (
          <div className="flex flex-wrap gap-2">
            {exp.factura_id && !items.length && (
              <button onClick={() => void copiarDeFactura()} disabled={copiando} className={btnSecundario}>
                <Copy className="h-3.5 w-3.5" /> {copiando ? "Copiando…" : "Copiar de la factura"}
              </button>
            )}
            <button onClick={() => setModal("nuevo")} className={btnPrimario}>
              <Plus className="h-3.5 w-3.5" /> Agregar producto
            </button>
          </div>
        )}
      </div>
      {error && <Aviso>{error}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3 text-right">Cantidad</th>
              <th className="px-4 py-3">Contenedor</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  Todavía no hay productos.
                </td>
              </tr>
            )}
            {items.map((it) => (
              <tr key={it.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{it.producto_nombre}</div>
                  {it.sku && <div className="text-xs text-slate-500">{it.sku}</div>}
                </td>
                <td className="px-4 py-3 text-right">{cant(it.cantidad)}</td>
                <td className="px-4 py-3">
                  {asignaContenedor && contenedores.length ? (
                    <select value={it.contenedor_id ?? ""} onChange={(e) => void cambiarContenedor(it, e.target.value)} className={`${inputClass} py-1 text-xs`}>
                      <option value="">—</option>
                      {contenedores.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.numero}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-500">{(it.contenedor_id && contNumero.get(it.contenedor_id)) || "—"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {editable && (
                    <div className="inline-flex gap-3">
                      <button onClick={() => setModal(it)} className="text-xs font-medium text-sky-700 hover:underline">
                        Editar
                      </button>
                      <button onClick={() => setQuitar(it)} className="text-xs font-medium text-rose-600 hover:underline">
                        Quitar
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <ModalProducto expId={exp.id} item={modal === "nuevo" ? null : modal} contenedores={contenedores} onClose={() => setModal(null)} onSaved={onCambio} />}
      <ConfirmModal
        open={!!quitar}
        title="Quitar producto"
        message={`¿Quitar "${quitar?.producto_nombre}" del envío?`}
        confirmLabel="Quitar"
        tone="danger"
        onConfirm={() => void confirmarQuitar()}
        onCancel={() => setQuitar(null)}
      />
    </section>
  );
}

function ModalProducto({
  expId,
  item,
  contenedores,
  onClose,
  onSaved,
}: {
  expId: string;
  item: ExportacionItem | null;
  contenedores: Contenedor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [producto, setProducto] = useState<ProductoLista | null>(item?.producto_id ? { id: item.producto_id, nombre: item.producto_nombre, sku: item.sku } : null);
  const [cantidad, setCantidad] = useState(item ? String(item.cantidad) : "");
  const [contenedor, setContenedor] = useState(item?.contenedor_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!producto) return setError("Elegí un producto del inventario.");
    if (!(Number(cantidad) > 0)) return setError("La cantidad tiene que ser mayor a 0.");
    setSaving(true);
    setError(null);
    const body = { producto_id: producto.id, cantidad: Number(cantidad), contenedor_id: contenedor || null };
    try {
      if (item) await api(`/api/exportaciones/${expId}/items/${item.id}`, jsonInit("PATCH", body));
      else await api(`/api/exportaciones/${expId}/items`, jsonInit("POST", body));
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  }

  return (
    <ModalShell title={item ? "Editar producto" : "Agregar producto"} onClose={onClose}>
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <label className={labelClass}>Producto del inventario *</label>
          <ProductoBuscador valor={producto} onElegir={(p) => { setProducto(p); setError(null); }} autoFocus={!item} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Cantidad *</label>
            <input type="number" step="any" min={0} value={cantidad} onWheel={noRueda} onChange={(e) => setCantidad(e.target.value)} className={`${inputClass} ${sinFlechas}`} />
          </div>
          {contenedores.length > 0 && (
            <div>
              <label className={labelClass}>Contenedor</label>
              <select value={contenedor} onChange={(e) => setContenedor(e.target.value)} className={inputClass}>
                <option value="">— Sin asignar —</option>
                {contenedores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={saving} className={btnPrimario}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
