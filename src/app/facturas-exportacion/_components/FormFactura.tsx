"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AUTOIMPRESOR_DEFAULT, MONEDAS_EXPORTACION } from "@/lib/facturas-exportacion/config";

interface Item { descripcion: string; cantidad: string; precio_unitario: string; }
const emptyItem: Item = { descripcion: "", cantidad: "1", precio_unitario: "0" };

export default function FormFactura({ regularizacion = false }: { regularizacion?: boolean }) {
  const router = useRouter();
  const [establecimiento] = useState(AUTOIMPRESOR_DEFAULT.establecimiento);
  const [punto, setPunto] = useState(AUTOIMPRESOR_DEFAULT.puntos[0]);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [numeroReg, setNumeroReg] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [tipoCambio, setTipoCambio] = useState("1");
  const [cliente, setCliente] = useState("");
  const [pais, setPais] = useState("BOLIVIA");
  const [documento, setDocumento] = useState("");
  const [direccion, setDireccion] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState<Item[]>([{ ...emptyItem }]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<Array<{ punto_expedicion: string; timbrado: string; vigencia_desde: string; vigencia_hasta: string; proximo_numero: number }>>([]);

  useEffect(() => {
    fetch("/api/facturas-exportacion/config", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j?.success) setConfig(j.data?.config ?? []); })
      .catch(() => undefined);
  }, []);

  const cfgActual = config.find((c) => c.punto_expedicion === punto);
  const total = items.reduce((acc, it) => acc + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0), 0);

  function updateItem(i: number, campo: keyof Item, valor: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setError(null);
    if (!cliente.trim()) { setError("Falta el nombre del cliente."); return; }
    const itemsPayload = items
      .map((it) => ({
        descripcion: it.descripcion.trim(),
        cantidad: Number(it.cantidad) || 0,
        precio_unitario: Number(it.precio_unitario) || 0,
      }))
      .filter((it) => it.descripcion && it.cantidad > 0);
    if (itemsPayload.length === 0) { setError("Agregá al menos un item con cantidad > 0."); return; }
    if (regularizacion) {
      const n = Number(numeroReg);
      if (!Number.isFinite(n) || n <= 0) { setError("Ingresá el número histórico de la factura."); return; }
    }

    setEnviando(true);
    try {
      const body: Record<string, unknown> = {
        establecimiento,
        punto_expedicion: punto,
        fecha,
        moneda,
        tipo_cambio: Number(tipoCambio) || 1,
        cliente_nombre: cliente.trim(),
        cliente_pais: pais.trim().toUpperCase() || "BOLIVIA",
        cliente_documento: documento.trim() || null,
        cliente_direccion: direccion.trim() || null,
        observaciones: observaciones.trim() || null,
        items: itemsPayload,
      };
      if (regularizacion) {
        body.regularizacion = true;
        body.numero = Number(numeroReg);
      }
      const res = await fetch("/api/facturas-exportacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok || !j?.success) {
        setError(j?.error ?? "No se pudo emitir la factura.");
        return;
      }
      router.push("/facturas-exportacion");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Zentra · Autoimpresor</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
          {regularizacion ? "Regularización de factura" : "Nueva factura de exportación"}
        </h1>
        <p className="mt-0.5 text-xs text-slate-500">
          {regularizacion
            ? "Cargá facturas históricas (agosto) indicando el número manualmente. No consume correlativo."
            : "Reserva atómica del correlativo por punto. No hay huecos ni duplicados."}
        </p>
      </div>

      <div className="zx-surface p-6 space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Establecimiento</label>
            <input value={establecimiento} disabled className="zx-surface w-full px-3 py-2 text-sm bg-slate-50" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Punto</label>
            <select value={punto} onChange={(e) => setPunto(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm">
              {AUTOIMPRESOR_DEFAULT.puntos.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {cfgActual && !regularizacion && (
              <p className="mt-1 text-[11px] text-slate-500">Próx. Nº: <strong>{cfgActual.proximo_numero}</strong> · Timbrado {cfgActual.timbrado}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm" />
          </div>
          {regularizacion && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Nº manual</label>
              <input type="number" min={1} value={numeroReg} onChange={(e) => setNumeroReg(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm" placeholder="p. ej. 12" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Cliente (nombre completo)</label>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm" placeholder="Razón social del comprador" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">País</label>
            <input value={pais} onChange={(e) => setPais(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Documento / RUC / NIT</label>
            <input value={documento} onChange={(e) => setDocumento(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Dirección</label>
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Moneda</label>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm">
              {MONEDAS_EXPORTACION.map((m) => (
                <option key={m.codigo} value={m.codigo}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Tipo de cambio (a Gs.)</label>
            <input type="number" step="0.0001" min="0" value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      <div className="zx-surface p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Items</h2>
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, { ...emptyItem }])}
            className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            + Agregar item
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-2 text-left">Descripción</th>
              <th className="py-2 text-right w-24">Cantidad</th>
              <th className="py-2 text-right w-32">P. unit.</th>
              <th className="py-2 text-right w-32">Subtotal</th>
              <th className="py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const sub = (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0);
              return (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2 pr-2">
                    <input value={it.descripcion} onChange={(e) => updateItem(i, "descripcion", e.target.value)} className="zx-surface w-full px-2 py-1.5 text-sm" placeholder="Descripción del ítem" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min="0" step="1" value={it.cantidad} onChange={(e) => updateItem(i, "cantidad", e.target.value)} className="zx-surface w-full px-2 py-1.5 text-sm text-right" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min="0" step="0.01" value={it.precio_unitario} onChange={(e) => updateItem(i, "precio_unitario", e.target.value)} className="zx-surface w-full px-2 py-1.5 text-sm text-right" />
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{sub.toLocaleString("es-PY", { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 text-right">
                    <button type="button" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700" aria-label="Eliminar">×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-3 text-right text-xs uppercase tracking-wider text-slate-500">Total {moneda}</td>
              <td className="pt-3 text-right text-base font-bold tabular-nums text-slate-900">{total.toLocaleString("es-PY", { minimumFractionDigits: 2 })}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="zx-surface p-6">
        <label className="mb-1 block text-xs font-medium text-slate-500">Observaciones</label>
        <textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className="zx-surface w-full px-3 py-2 text-sm" />
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
        >
          {enviando ? "Emitiendo…" : regularizacion ? "Regularizar factura" : "Emitir factura"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/facturas-exportacion")}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
