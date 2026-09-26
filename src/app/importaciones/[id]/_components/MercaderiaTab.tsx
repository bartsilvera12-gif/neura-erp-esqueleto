"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import ConfirmModal from "@/components/ui/ConfirmModal";
import type { Importacion, ImportacionItem } from "@/lib/importaciones/types";
import type { Contenedor } from "@/lib/comex/types";
import ProductoBuscador, { type ProductoLista } from "../../_components/ProductoBuscador";
import {
  Aviso,
  ModalShell,
  api,
  btnPrimario,
  btnSecundario,
  inputClass,
  jsonInit,
  labelClass,
  noRueda,
  sinFlechas,
} from "@/components/comex/ui";

const money = (v: number, m: string) => `${m} ${Number(v).toLocaleString("es-PY", { maximumFractionDigits: 2 })}`;
const cant = (v: number) => Number(v).toLocaleString("es-PY");

export default function MercaderiaTab({
  imp,
  items,
  contenedores,
  onCambio,
}: {
  imp: Importacion;
  items: ImportacionItem[];
  contenedores: Contenedor[];
  onCambio: () => void;
}) {
  const editable = imp.estado === "borrador";
  const cerrada = imp.estado === "cerrada" || imp.estado === "anulada";
  const [modal, setModal] = useState<ImportacionItem | "nuevo" | null>(null);
  const [seriales, setSeriales] = useState<ImportacionItem | null>(null);
  const [quitar, setQuitar] = useState<ImportacionItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contNumero = new Map(contenedores.map((c) => [c.id, c.numero]));
  const total = items.reduce((s, i) => s + Number(i.subtotal), 0);
  const sinVincular = items.filter((i) => !i.producto_id);

  async function cambiarContenedor(it: ImportacionItem, contenedorId: string) {
    setError(null);
    try {
      await api(`/api/importaciones/${imp.id}/items/${it.id}`, jsonInit("PATCH", { contenedor_id: contenedorId || null }));
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function confirmarQuitar() {
    if (!quitar) return;
    try {
      await api(`/api/importaciones/${imp.id}/items/${quitar.id}`, { method: "DELETE" });
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
          {editable
            ? "Productos del inventario que se esperan. Se pueden cambiar mientras la importación está en borrador."
            : "La cantidad pedida queda fija como referencia para comparar con lo que llega."}
        </p>
        {editable && (
          <button onClick={() => setModal("nuevo")} className={btnPrimario}>
            <Plus className="h-3.5 w-3.5" /> Agregar producto
          </button>
        )}
      </div>
      {sinVincular.length > 0 && (
        <Aviso>
          <span className="inline-flex items-center gap-1 font-medium">
            <AlertTriangle className="h-4 w-4" /> {sinVincular.length} producto(s) cargados a mano, sin vincular al inventario.
          </span>{" "}
          {editable ? "Tocá Editar y elegilos del inventario." : "Solo se pueden corregir en borrador."}
        </Aviso>
      )}
      {error && <Aviso>{error}</Aviso>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3 text-right">Pedido</th>
              <th className="px-4 py-3 text-right">Recibido</th>
              <th className="px-4 py-3 text-right">Precio</th>
              <th className="px-4 py-3 text-right">Subtotal</th>
              <th className="px-4 py-3">Contenedor</th>
              <th className="px-4 py-3">Seriales</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  Todavía no hay productos.
                </td>
              </tr>
            )}
            {items.map((it) => {
              const dif = Number(it.cantidad_recibida) - Number(it.cantidad);
              const hayRecepcion = Number(it.cantidad_recibida) > 0;
              return (
                <tr key={it.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{it.producto_nombre}</div>
                    <div className="text-xs text-slate-500">
                      {it.sku ?? ""}
                      {!it.producto_id && <span className="ml-1 font-semibold text-rose-600">· sin vincular</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">{cant(it.cantidad)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className={hayRecepcion && dif !== 0 ? "font-semibold text-rose-700" : "text-slate-700"}>{cant(it.cantidad_recibida)}</div>
                    {hayRecepcion && dif !== 0 && <div className="text-[11px] text-rose-600">{dif > 0 ? `sobran ${cant(dif)}` : `faltan ${cant(-dif)}`}</div>}
                  </td>
                  <td className="px-4 py-3 text-right">{money(it.precio_unitario, it.moneda)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{money(it.subtotal, it.moneda)}</td>
                  <td className="px-4 py-3">
                    {cerrada || !contenedores.length ? (
                      <span className="text-xs text-slate-500">{(it.contenedor_id && contNumero.get(it.contenedor_id)) || "—"}</span>
                    ) : (
                      <select value={it.contenedor_id ?? ""} onChange={(e) => void cambiarContenedor(it, e.target.value)} className={`${inputClass} py-1 text-xs`}>
                        <option value="">—</option>
                        {contenedores.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.numero}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSeriales(it)} className="text-xs font-medium text-emerald-700 hover:underline">
                      {it.seriales_count ?? 0} de {cant(it.cantidad)}
                    </button>
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
              );
            })}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={4} className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                  Total
                </td>
                <td className="px-4 py-3 text-right font-semibold">{money(total, imp.moneda)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {modal && (
        <ModalProducto
          imp={imp}
          item={modal === "nuevo" ? null : modal}
          contenedores={contenedores}
          onClose={() => setModal(null)}
          onSaved={onCambio}
        />
      )}
      {seriales && <ModalSeriales imp={imp} item={seriales} bloqueado={cerrada} onClose={() => setSeriales(null)} onSaved={onCambio} />}
      <ConfirmModal
        open={!!quitar}
        title="Quitar producto"
        message={`¿Quitar "${quitar?.producto_nombre}" de la importación?`}
        confirmLabel="Quitar"
        tone="danger"
        onConfirm={() => void confirmarQuitar()}
        onCancel={() => setQuitar(null)}
      />
    </section>
  );
}

function ModalProducto({
  imp,
  item,
  contenedores,
  onClose,
  onSaved,
}: {
  imp: Importacion;
  item: ImportacionItem | null;
  contenedores: Contenedor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [producto, setProducto] = useState<ProductoLista | null>(
    item?.producto_id ? { id: item.producto_id, nombre: item.producto_nombre, sku: item.sku } : null
  );
  const [cantidad, setCantidad] = useState(item ? String(item.cantidad) : "");
  const [precio, setPrecio] = useState(item ? String(item.precio_unitario) : "");
  const [contenedor, setContenedor] = useState(item?.contenedor_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const num = `${inputClass} ${sinFlechas}`;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!producto) return setError("Elegí un producto del inventario.");
    if (!(Number(cantidad) > 0)) return setError("La cantidad tiene que ser mayor a 0.");
    setSaving(true);
    setError(null);
    const body = {
      producto_id: producto.id,
      cantidad: Number(cantidad),
      precio_unitario: Number(precio) || 0,
      moneda: imp.moneda,
      contenedor_id: contenedor || null,
    };
    try {
      if (item) await api(`/api/importaciones/${imp.id}/items/${item.id}`, jsonInit("PATCH", body));
      else await api(`/api/importaciones/${imp.id}/items`, jsonInit("POST", body));
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
          {item && !item.producto_id && (
            <p className="mt-1 text-xs text-rose-600">Estaba cargado a mano como “{item.producto_nombre}”. Elegilo del inventario.</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Cantidad *</label>
            <input type="number" step="any" min={0} value={cantidad} onWheel={noRueda} onChange={(e) => setCantidad(e.target.value)} className={num} />
          </div>
          <div>
            <label className={labelClass}>Precio unitario ({imp.moneda})</label>
            <input type="number" step="any" min={0} value={precio} onWheel={noRueda} onChange={(e) => setPrecio(e.target.value)} className={num} />
          </div>
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

function ModalSeriales({
  imp,
  item,
  bloqueado,
  onClose,
  onSaved,
}: {
  imp: Importacion;
  item: ImportacionItem;
  bloqueado: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [lista, setLista] = useState<{ id: string; serial: string }[] | null>(null);
  const [texto, setTexto] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const base = `/api/importaciones/${imp.id}/items/${item.id}/seriales`;

  const cargar = useCallback(async () => {
    const d = await api<{ seriales: { id: string; serial: string }[] }>(base);
    setLista(d.seriales);
  }, [base]);
  useEffect(() => {
    cargar().catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [cargar]);

  async function agregar() {
    const seriales = texto.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!seriales.length) return setError("Escribí al menos un serial.");
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const d = await api<{ agregados: number }>(base, jsonInit("POST", { seriales }));
      setOk(`Se agregaron ${d.agregados} serial(es).`);
      setTexto("");
      await cargar();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function quitar(id: string) {
    setError(null);
    try {
      await api(`${base}?serialId=${id}`, { method: "DELETE" });
      await cargar();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <ModalShell title={`Seriales · ${item.producto_nombre}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          {lista?.length ?? 0} de {Number(item.cantidad).toLocaleString("es-PY")} unidades con serial. Un serial no puede repetirse en ninguna importación.
        </p>
        {!bloqueado && (
          <div className="space-y-2">
            <label className={labelClass}>Agregar seriales (uno por renglón)</label>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} className={`${inputClass} font-mono`} placeholder={"SN-0001\nSN-0002"} />
            <div className="flex justify-end">
              <button onClick={() => void agregar()} disabled={saving} className={btnPrimario}>
                {saving ? "Guardando…" : "Agregar"}
              </button>
            </div>
          </div>
        )}
        {error && <Aviso>{error}</Aviso>}
        {ok && <Aviso tipo="ok">{ok}</Aviso>}
        <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200">
          {lista?.length === 0 && <p className="p-4 text-center text-sm text-slate-500">Sin seriales.</p>}
          {lista?.map((s) => (
            <div key={s.id} className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5 first:border-t-0">
              <span className="font-mono text-sm">{s.serial}</span>
              {!bloqueado && (
                <button onClick={() => void quitar(s.id)} className="text-xs text-rose-600 hover:underline">
                  Quitar
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}
