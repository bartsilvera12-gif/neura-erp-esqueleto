"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MONEDAS_EXPORTACION, TIPOS_FACTURA, type TipoFactura } from "@/lib/facturas-exportacion/config";
import type { IvaTipo } from "@/lib/facturas-exportacion/types";
import { useIsAdmin } from "@/lib/auth/use-is-admin";

interface Item { descripcion: string; cantidad: string; precio_unitario: string; iva_tipo: IvaTipo }
interface PuntoConfig {
  establecimiento: string;
  punto_expedicion: string;
  timbrado: string;
  vigencia_desde: string;
  vigencia_hasta: string;
  proximo_numero: number;
  activo: boolean;
  tipo: TipoFactura;
}

const hoy = () => new Date().toISOString().slice(0, 10);
const fechaES = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const input = "zx-surface w-full px-3 py-2 text-sm";
const lbl = "mb-1 block text-xs font-medium text-slate-500";

export default function FormFactura({ regularizacion = false }: { regularizacion?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const { isAdmin, loaded: rolCargado } = useIsAdmin();
  const tipoParam = params.get("tipo");
  const [tipo, setTipo] = useState<TipoFactura | null>(
    tipoParam === "LOCAL" || tipoParam === "EXPORTACION" ? tipoParam : null
  );
  const esExpo = tipo === "EXPORTACION";

  const [config, setConfig] = useState<PuntoConfig[]>([]);
  const [punto, setPunto] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [numeroReg, setNumeroReg] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [tipoCambio, setTipoCambio] = useState("1");
  const [condicion, setCondicion] = useState<"CONTADO" | "CREDITO">("CONTADO");
  const [cliente, setCliente] = useState({ nombre: "", documento: "", direccion: "", ciudad: "", telefono: "", pais: "BOLIVIA" });
  const [notaRemision, setNotaRemision] = useState("");
  const [op, setOp] = useState({
    tipo_operacion: "EXPORTACIÓN",
    condicion_negociacion: "EXW - ASUNCIÓN",
    agente_transporte: "",
    barcaza: "",
    empresa_fletera: "",
    conocimiento: "",
  });
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/facturas-exportacion/config", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j?.success) setConfig(j.data?.config ?? []); })
      .catch(() => undefined);
  }, []);

  const puntosTipo = useMemo(
    () => config.filter((c) => c.activo && (c.tipo ?? "EXPORTACION") === tipo),
    [config, tipo]
  );

  function elegirTipo(t: TipoFactura) {
    setTipo(t);
    setMoneda(TIPOS_FACTURA[t].monedaDefault);
    setTipoCambio("1");
    setCliente((c) => ({ ...c, pais: t === "LOCAL" ? "PARAGUAY" : "BOLIVIA" }));
    setItems([{ descripcion: "", cantidad: "1", precio_unitario: "", iva_tipo: t === "LOCAL" ? "10" : "EXENTA" }]);
    setPunto("");
    setError(null);
  }

  useEffect(() => {
    if (tipo && !items.length) elegirTipo(tipo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  useEffect(() => {
    if (!punto && puntosTipo.length) setPunto(puntosTipo[0].punto_expedicion);
  }, [puntosTipo, punto]);

  const cfg = puntosTipo.find((c) => c.punto_expedicion === punto);
  const fueraVigencia = cfg ? fecha < cfg.vigencia_desde || fecha > cfg.vigencia_hasta : false;

  const sub = (it: Item) => (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0);
  const totalPor = (t: IvaTipo) => items.filter((i) => i.iva_tipo === t).reduce((a, i) => a + sub(i), 0);
  const total = items.reduce((a, i) => a + sub(i), 0);
  const dec = moneda === "PYG" ? 0 : 2;
  const fmt = (n: number) => n.toLocaleString("es-PY", { minimumFractionDigits: dec, maximumFractionDigits: dec });

  function updateItem(i: number, campo: keyof Item, valor: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (enviando || !tipo || !cfg) return;
    setError(null);
    if (!cliente.nombre.trim()) return setError("Falta el nombre o razón social del cliente.");
    const itemsPayload = items
      .map((it) => ({
        descripcion: it.descripcion.trim(),
        cantidad: Number(it.cantidad) || 0,
        precio_unitario: Number(it.precio_unitario) || 0,
        iva_tipo: it.iva_tipo,
      }))
      .filter((it) => it.descripcion && it.cantidad > 0);
    if (!itemsPayload.length) return setError("Agregá al menos un ítem con descripción y cantidad.");
    if (fueraVigencia) return setError("La fecha está fuera de la vigencia del timbrado.");
    if (regularizacion && !(Number(numeroReg) > 0)) return setError("Ingresá el número de la factura a regularizar.");

    setEnviando(true);
    try {
      const res = await fetch("/api/facturas-exportacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tipo,
          establecimiento: cfg.establecimiento,
          punto_expedicion: cfg.punto_expedicion,
          fecha,
          moneda,
          tipo_cambio: Number(tipoCambio) || 1,
          condicion_venta: condicion,
          cliente_nombre: cliente.nombre.trim(),
          cliente_documento: cliente.documento,
          cliente_direccion: cliente.direccion,
          cliente_ciudad: cliente.ciudad,
          cliente_telefono: cliente.telefono,
          cliente_pais: cliente.pais,
          nota_remision: notaRemision,
          ...(esExpo ? op : {}),
          observaciones,
          items: itemsPayload,
          ...(regularizacion ? { regularizacion: true, numero: Number(numeroReg) } : {}),
        }),
      });
      const j = await res.json();
      if (!res.ok || !j?.success) return setError(j?.error ?? "No se pudo emitir la factura.");
      const id = j.data?.factura?.id;
      if (id) window.open(`/api/facturas-exportacion/${id}/pdf`, "_blank");
      router.push("/facturas-exportacion");
    } finally {
      setEnviando(false);
    }
  }

  if (regularizacion && rolCargado && !isAdmin) {
    return <div className="zx-surface p-6 text-sm text-slate-600">Solo un administrador puede regularizar facturas.</div>;
  }

  const encabezado = (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Zentra · Autoimpresor</p>
      <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
        {regularizacion ? "Regularización de factura" : "Nueva factura"}
        {tipo && <span className="text-slate-400"> · {TIPOS_FACTURA[tipo].label}</span>}
      </h1>
      <p className="mt-0.5 text-xs text-slate-500">
        {regularizacion
          ? "Carga de facturas ya emitidas (agosto) con su número original. No consume correlativo."
          : "El número se reserva automáticamente al emitir: sin huecos ni duplicados."}
      </p>
    </div>
  );

  if (!tipo) {
    return (
      <div className="space-y-6">
        {encabezado}
        <p className="text-sm font-medium text-slate-700">¿Qué factura querés hacer?</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {([
            { t: "EXPORTACION" as const, desc: "Venta al exterior (Bolivia). En dólares, exenta de IVA, con datos de operación, logística y banco." },
            { t: "LOCAL" as const, desc: "Venta en Paraguay. En guaraníes, con IVA 10% / 5%, contado o crédito y nota de remisión." },
          ]).map(({ t, desc }) => (
            <button
              key={t}
              type="button"
              onClick={() => elegirTipo(t)}
              className="zx-surface zx-surface-interactive rounded-xl p-6 text-left transition hover:border-[#4FAEB2] hover:ring-2 hover:ring-[#4FAEB2]/20"
            >
              <p className="text-base font-semibold text-slate-900">{TIPOS_FACTURA[t].label}</p>
              <p className="mt-1 text-sm text-slate-500">{desc}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {encabezado}
        <button type="button" onClick={() => setTipo(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          Cambiar tipo
        </button>
      </div>

      {/* Timbrado */}
      <div className="zx-surface p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className={lbl}>Punto de expedición</label>
            <select value={punto} onChange={(e) => setPunto(e.target.value)} className={input}>
              {puntosTipo.length === 0 && <option value="">Sin timbrado configurado</option>}
              {puntosTipo.map((p) => (
                <option key={p.punto_expedicion} value={p.punto_expedicion}>
                  {p.establecimiento}-{p.punto_expedicion}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Fecha de emisión</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={input} />
          </div>
          {regularizacion ? (
            <div>
              <label className={lbl}>Número de factura</label>
              <input type="number" min={1} value={numeroReg} onChange={(e) => setNumeroReg(e.target.value)} className={input} placeholder="Ej: 12" />
            </div>
          ) : (
            <div>
              <label className={lbl}>Próximo número</label>
              <p className="py-2 font-mono text-sm text-slate-800">
                {cfg ? `${cfg.establecimiento}-${cfg.punto_expedicion}-${String(cfg.proximo_numero).padStart(7, "0")}` : "—"}
              </p>
            </div>
          )}
          <div>
            <label className={lbl}>Timbrado</label>
            <p className="py-2 text-sm text-slate-800">
              {cfg ? `${cfg.timbrado} · ${fechaES(cfg.vigencia_desde)} al ${fechaES(cfg.vigencia_hasta)}` : "—"}
            </p>
          </div>
        </div>
        {fueraVigencia && (
          <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            La fecha elegida está fuera de la vigencia del timbrado {cfg?.timbrado}. No se puede emitir.
          </p>
        )}
      </div>

      {/* Cliente */}
      <div className="zx-surface p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">Datos del cliente</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className={lbl}>Nombre o razón social</label>
            <input value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} className={input} />
          </div>
          <div>
            <label className={lbl}>RUC o C.I. Nº</label>
            <input value={cliente.documento} onChange={(e) => setCliente({ ...cliente, documento: e.target.value })} className={input} />
          </div>
          <div className={esExpo ? "" : "md:col-span-2"}>
            <label className={lbl}>Dirección</label>
            <input value={cliente.direccion} onChange={(e) => setCliente({ ...cliente, direccion: e.target.value })} className={input} />
          </div>
          <div>
            <label className={lbl}>Teléfono</label>
            <input value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} className={input} />
          </div>
          {esExpo && (
            <>
              <div>
                <label className={lbl}>Ciudad</label>
                <input value={cliente.ciudad} onChange={(e) => setCliente({ ...cliente, ciudad: e.target.value })} className={input} />
              </div>
              <div>
                <label className={lbl}>País</label>
                <input value={cliente.pais} onChange={(e) => setCliente({ ...cliente, pais: e.target.value })} className={input} />
              </div>
            </>
          )}
          <div>
            <label className={lbl}>Condición de venta</label>
            <select value={condicion} onChange={(e) => setCondicion(e.target.value as "CONTADO" | "CREDITO")} className={input}>
              <option value="CONTADO">Contado</option>
              <option value="CREDITO">Crédito</option>
            </select>
          </div>
          {!esExpo && (
            <div>
              <label className={lbl}>Nota de remisión Nº</label>
              <input value={notaRemision} onChange={(e) => setNotaRemision(e.target.value)} className={input} />
            </div>
          )}
        </div>
      </div>

      {esExpo && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="zx-surface p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">Datos de la operación</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Tipo de operación</label>
                <input value={op.tipo_operacion} onChange={(e) => setOp({ ...op, tipo_operacion: e.target.value })} className={input} />
              </div>
              <div>
                <label className={lbl}>Condición de negociación</label>
                <input value={op.condicion_negociacion} onChange={(e) => setOp({ ...op, condicion_negociacion: e.target.value })} className={input} />
              </div>
              <div>
                <label className={lbl}>Moneda</label>
                <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={input}>
                  {MONEDAS_EXPORTACION.map((m) => (
                    <option key={m.codigo} value={m.codigo}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Tipo de cambio (a Gs.)</label>
                <input type="number" step="0.0001" min="0" value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} className={input} />
              </div>
            </div>
          </div>
          <div className="zx-surface p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">Datos logísticos</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Agente de transporte</label>
                <input value={op.agente_transporte} onChange={(e) => setOp({ ...op, agente_transporte: e.target.value })} className={input} />
              </div>
              <div>
                <label className={lbl}>Barcaza / remolcador</label>
                <input value={op.barcaza} onChange={(e) => setOp({ ...op, barcaza: e.target.value })} className={input} />
              </div>
              <div>
                <label className={lbl}>Empresa fletera / exportador nacional</label>
                <input value={op.empresa_fletera} onChange={(e) => setOp({ ...op, empresa_fletera: e.target.value })} className={input} />
              </div>
              <div>
                <label className={lbl}>Conocimiento / manifiesto</label>
                <input value={op.conocimiento} onChange={(e) => setOp({ ...op, conocimiento: e.target.value })} className={input} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ítems */}
      <div className="zx-surface p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Ítems</h2>
          <button
            type="button"
            onClick={() => setItems((p) => [...p, { descripcion: "", cantidad: "1", precio_unitario: "", iva_tipo: esExpo ? "EXENTA" : "10" }])}
            className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            + Agregar ítem
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                <th className="w-24 py-2 text-right">Cant.</th>
                <th className="py-2 pl-3 text-left">Descripción</th>
                <th className="w-36 py-2 text-right">Precio unitario</th>
                {!esExpo && <th className="w-28 py-2 text-center">IVA</th>}
                <th className="w-36 py-2 text-right">Subtotal</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2">
                    <input type="number" min="0" step="0.01" value={it.cantidad} onChange={(e) => updateItem(i, "cantidad", e.target.value)} className="zx-surface w-full px-2 py-1.5 text-right text-sm" />
                  </td>
                  <td className="py-2 pl-3">
                    <input value={it.descripcion} onChange={(e) => updateItem(i, "descripcion", e.target.value)} className="zx-surface w-full px-2 py-1.5 text-sm" placeholder="Ej: SOFA MARTIN 3C" />
                  </td>
                  <td className="py-2 pl-2">
                    <input type="number" min="0" step={dec ? "0.01" : "1"} value={it.precio_unitario} onChange={(e) => updateItem(i, "precio_unitario", e.target.value)} className="zx-surface w-full px-2 py-1.5 text-right text-sm" />
                  </td>
                  {!esExpo && (
                    <td className="py-2 pl-2">
                      <select value={it.iva_tipo} onChange={(e) => updateItem(i, "iva_tipo", e.target.value)} className="zx-surface w-full px-2 py-1.5 text-sm">
                        <option value="10">10%</option>
                        <option value="5">5%</option>
                        <option value="EXENTA">Exenta</option>
                      </select>
                    </td>
                  )}
                  <td className="py-2 text-right tabular-nums">{fmt(sub(it))}</td>
                  <td className="py-2 text-right">
                    <button type="button" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))} className="px-1 text-red-500 hover:text-red-700" aria-label="Quitar ítem">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-end gap-6 text-sm">
          {!esExpo && (
            <div className="text-xs text-slate-500">
              Exentas {fmt(totalPor("EXENTA"))} · Gravado 5% {fmt(totalPor("5"))} · Gravado 10% {fmt(totalPor("10"))}
              <br />
              IVA 5% {fmt(totalPor("5") / 21)} · IVA 10% {fmt(totalPor("10") / 11)}
            </div>
          )}
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-slate-500">Total</p>
            <p className="text-xl font-bold tabular-nums text-slate-900">
              {moneda === "PYG" ? "Gs." : moneda} {fmt(total)}
            </p>
          </div>
        </div>
      </div>

      <div className="zx-surface p-6">
        <label className={lbl}>Observaciones</label>
        <textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={input} />
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={enviando || !cfg || fueraVigencia}
          className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
        >
          {enviando ? "Emitiendo…" : regularizacion ? "Registrar factura" : "Emitir factura"}
        </button>
        <button type="button" onClick={() => router.push("/facturas-exportacion")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}
