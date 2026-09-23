"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MONEDAS_EXPORTACION, TIPOS_FACTURA, type TipoFactura } from "@/lib/facturas-exportacion/config";
import type { IvaTipo } from "@/lib/facturas-exportacion/types";

interface Item {
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: string;
  precio_unitario: string;
  descuento: string;
  iva_tipo: IvaTipo;
}
interface PuntoConfig {
  establecimiento: string;
  punto_expedicion: string;
  timbrado: string;
  vigencia_desde: string;
  vigencia_hasta: string;
  proximo_numero: number;
  proximo_numero_prueba: number;
  modo_prueba: boolean;
  activo: boolean;
}
interface ClienteLista {
  id: string;
  empresa?: string | null;
  nombre_contacto?: string | null;
  nombre?: string | null;
  ruc?: string | null;
  documento?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  pais?: string | null;
  telefono?: string | null;
  email?: string | null;
}
interface Reemision {
  id: string;
  numero_original: string;
  timbrado_original: string;
  cliente_nombre: string;
  cliente_pais: string | null;
  moneda: string;
}

const hoy = () => new Date().toISOString().slice(0, 10);
const fechaES = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const input = "zx-surface w-full px-3 py-2 text-sm";
const lbl = "mb-1 block text-xs font-medium text-slate-500";
const itemVacio = (t: TipoFactura | null): Item => ({
  codigo: "",
  descripcion: "",
  unidad: "UN",
  cantidad: "1",
  precio_unitario: "",
  descuento: "",
  iva_tipo: t === "LOCAL" ? "10" : "EXENTA",
});
const clienteVacio = { id: "", nombre: "", documento: "", direccion: "", ciudad: "", telefono: "", email: "", pais: "" };
const nombreCliente = (c: ClienteLista) => (c.empresa || c.nombre_contacto || c.nombre || "").trim();

export default function FormFactura() {
  const router = useRouter();
  const params = useSearchParams();
  const tipoParam = params.get("tipo");
  const reemiteId = params.get("reemite");
  const borradorParam = params.get("borrador");

  const [borradorId, setBorradorId] = useState<string | null>(borradorParam);
  const [reemision, setReemision] = useState<Reemision | null>(null);
  const [tipo, setTipo] = useState<TipoFactura | null>(
    tipoParam === "LOCAL" || tipoParam === "EXPORTACION" ? tipoParam : null
  );
  const esExpo = tipo === "EXPORTACION";

  const [config, setConfig] = useState<PuntoConfig[]>([]);
  const [punto, setPunto] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [moneda, setMoneda] = useState("USD");
  const [tipoCambio, setTipoCambio] = useState("");
  const [condicion, setCondicion] = useState<"CONTADO" | "CREDITO">("CONTADO");
  const [cliente, setCliente] = useState(clienteVacio);
  const [clientes, setClientes] = useState<ClienteLista[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [verLista, setVerLista] = useState(false);
  const [guardarCliente, setGuardarCliente] = useState(false);
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
  const [enviando, setEnviando] = useState<"" | "borrador" | "emitir">("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/facturas-exportacion/config", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j?.success) setConfig(j.data?.config ?? []); })
      .catch(() => undefined);
    fetch("/api/clientes", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const lista = Array.isArray(j?.data) ? j.data : j?.data?.clientes ?? [];
        setClientes(lista as ClienteLista[]);
      })
      .catch(() => undefined);
  }, []);

  // Reemisión de una factura de agosto: precarga cliente y moneda.
  useEffect(() => {
    if (!reemiteId) return;
    fetch("/api/facturas-regularizacion", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const r = ((j?.data?.regularizaciones ?? []) as Reemision[]).find((x) => x.id === reemiteId);
        if (!r) return;
        setReemision(r);
        setCliente((c) => ({ ...c, nombre: r.cliente_nombre, pais: r.cliente_pais ?? c.pais }));
        setMoneda(r.moneda);
      })
      .catch(() => undefined);
  }, [reemiteId]);

  // Continuar un borrador guardado.
  useEffect(() => {
    if (!borradorParam) return;
    fetch(`/api/facturas-exportacion/${borradorParam}`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const f = j?.data?.factura;
        if (!f) return setError("No se encontró el borrador.");
        if (f.estado !== "BORRADOR") return setError("Esa factura ya fue emitida.");
        const s = (v: unknown) => (v == null ? "" : String(v));
        setTipo(f.tipo === "LOCAL" ? "LOCAL" : "EXPORTACION");
        setPunto(s(f.punto_expedicion));
        setFecha(s(f.fecha).slice(0, 10) || hoy());
        setMoneda(s(f.moneda) || "USD");
        setTipoCambio(f.moneda === "PYG" || Number(f.tipo_cambio) <= 1 ? "" : s(f.tipo_cambio));
        setCondicion(f.condicion_venta === "CREDITO" ? "CREDITO" : "CONTADO");
        setCliente({
          id: s(f.cliente_id),
          nombre: f.cliente_nombre === "(sin cliente)" ? "" : s(f.cliente_nombre),
          documento: s(f.cliente_documento),
          direccion: s(f.cliente_direccion),
          ciudad: s(f.cliente_ciudad),
          telefono: s(f.cliente_telefono),
          email: s(f.cliente_email),
          pais: s(f.cliente_pais),
        });
        setNotaRemision(s(f.nota_remision));
        setOp({
          tipo_operacion: s(f.tipo_operacion) || "EXPORTACIÓN",
          condicion_negociacion: s(f.condicion_negociacion),
          agente_transporte: s(f.agente_transporte),
          barcaza: s(f.barcaza),
          empresa_fletera: s(f.empresa_fletera),
          conocimiento: s(f.conocimiento),
        });
        setObservaciones(s(f.observaciones));
        const its = (f.items ?? []) as Array<Record<string, unknown>>;
        setItems(
          its.length
            ? its.map((it) => ({
                codigo: s(it.codigo),
                descripcion: s(it.descripcion),
                unidad: s(it.unidad),
                cantidad: s(it.cantidad),
                precio_unitario: s(it.precio_unitario),
                descuento: Number(it.descuento) > 0 ? s(it.descuento) : "",
                iva_tipo: (it.iva_tipo as IvaTipo) ?? "EXENTA",
              }))
            : [itemVacio(f.tipo)]
        );
      })
      .catch(() => setError("No se pudo cargar el borrador."));
  }, [borradorParam]);

  const puntos = useMemo(() => config.filter((c) => c.activo), [config]);

  function elegirTipo(t: TipoFactura) {
    setTipo(t);
    setMoneda(reemision?.moneda ?? TIPOS_FACTURA[t].monedaDefault);
    setTipoCambio("");
    setCliente((c) => ({ ...c, pais: reemision?.cliente_pais ?? c.pais ?? (t === "LOCAL" ? "PARAGUAY" : "") }));
    setItems([itemVacio(t)]);
    setError(null);
  }

  useEffect(() => {
    if (tipo && !items.length && !borradorParam) elegirTipo(tipo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  useEffect(() => {
    if (!punto && puntos.length) setPunto(puntos[0].punto_expedicion);
  }, [puntos, punto]);

  const cfg = puntos.find((c) => c.punto_expedicion === punto);
  const fueraVigencia = cfg ? fecha < cfg.vigencia_desde || fecha > cfg.vigencia_hasta : false;
  const esPrueba = cfg ? cfg.modo_prueba !== false : true;
  const esPyg = moneda === "PYG";
  const tc = Number(tipoCambio) || 0;

  const dec = esPyg ? 0 : 2;
  const fmt = (n: number, d = dec) => n.toLocaleString("es-PY", { minimumFractionDigits: d, maximumFractionDigits: d });
  const bruto = (it: Item) => (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0);
  const neto = (it: Item) => bruto(it) - (Number(it.descuento) || 0);
  const totalPor = (t: IvaTipo) => items.filter((i) => i.iva_tipo === t).reduce((a, i) => a + neto(i), 0);
  const total = items.reduce((a, i) => a + neto(i), 0);
  const totalDescuento = items.reduce((a, i) => a + (Number(i.descuento) || 0), 0);

  const coincidencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes.slice(0, 8);
    return clientes
      .filter((c) => `${nombreCliente(c)} ${c.ruc ?? ""} ${c.documento ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [busqueda, clientes]);

  function elegirCliente(c: ClienteLista) {
    setCliente({
      id: c.id,
      nombre: nombreCliente(c),
      documento: (c.ruc || c.documento || "").trim(),
      direccion: (c.direccion || "").trim(),
      ciudad: (c.ciudad || "").trim(),
      telefono: (c.telefono || "").trim(),
      email: (c.email || "").trim(),
      pais: (c.pais || "").trim().toUpperCase(),
    });
    setBusqueda("");
    setVerLista(false);
    setGuardarCliente(false);
  }

  function updateItem(i: number, campo: keyof Item, valor: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)));
  }

  /** Mismas reglas que valida el servidor (QA-12/13/14), para avisar antes de enviar. */
  function validarEmision(): string | null {
    if (!cfg) return "Elegí el punto de expedición.";
    if (!cliente.nombre.trim()) return "Falta el nombre o razón social del cliente.";
    if (!cliente.pais.trim()) return "Falta el país del cliente.";
    const conDatos = items.filter((it) => it.descripcion.trim());
    if (!conDatos.length) return "Agregá al menos un producto.";
    for (const it of conDatos) {
      if (!(Number(it.cantidad) > 0) || !(Number(it.precio_unitario) > 0))
        return `"${it.descripcion}": la cantidad y el precio tienen que ser mayores a 0.`;
      if (neto(it) <= 0) return `"${it.descripcion}": el descuento no puede ser igual o mayor al importe.`;
    }
    if (!(total > 0)) return "El total de la factura tiene que ser mayor a 0.";
    if (!esPyg && !(tc > 1)) return `Para facturar en ${moneda} cargá el tipo de cambio a guaraníes del día.`;
    if (fueraVigencia) return "La fecha está fuera de la vigencia del timbrado.";
    return null;
  }

  async function guardar(accion: "borrador" | "emitir") {
    if (enviando || !tipo) return;
    setError(null);
    setAviso(null);
    if (accion === "emitir") {
      const err = validarEmision();
      if (err) return setError(err);
      const msg = esPrueba
        ? "¿Emitir la factura de prueba?"
        : `¿Emitir la factura ${cfg ? `${cfg.establecimiento}-${cfg.punto_expedicion}-${String(cfg.proximo_numero).padStart(7, "0")}` : ""}? Después no se puede modificar, solo anular.`;
      if (!window.confirm(msg)) return;
    } else if (!cfg) {
      return setError("Elegí el punto de expedición.");
    }

    setEnviando(accion);
    try {
      // Alta del cliente en Clientes, si lo pidió y todavía no existe.
      let clienteId = cliente.id || null;
      if (guardarCliente && !clienteId && cliente.nombre.trim()) {
        const rc = await fetch("/api/clientes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            tipo_cliente: "empresa",
            empresa: cliente.nombre.trim(),
            nombre_contacto: cliente.nombre.trim(),
            ruc: cliente.documento.trim() || null,
            direccion: cliente.direccion.trim() || null,
            ciudad: cliente.ciudad.trim() || null,
            pais: cliente.pais.trim() || null,
            telefono: cliente.telefono.trim() || null,
            email: cliente.email.trim() || null,
            moneda_preferida: esPyg ? "GS" : "USD",
          }),
        }).then((r) => r.json()).catch(() => null);
        if (rc?.success && rc.data?.id) {
          clienteId = rc.data.id as string;
          setCliente((c) => ({ ...c, id: clienteId as string }));
          setGuardarCliente(false);
        } else {
          setAviso("La factura se guarda igual, pero no se pudo dar de alta el cliente en Clientes.");
        }
      }

      const res = await fetch("/api/facturas-exportacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          accion,
          id: borradorId,
          tipo,
          establecimiento: cfg!.establecimiento,
          punto_expedicion: cfg!.punto_expedicion,
          fecha,
          moneda,
          tipo_cambio: esPyg ? 1 : tc,
          condicion_venta: condicion,
          cliente_id: clienteId,
          cliente_nombre: cliente.nombre.trim(),
          cliente_documento: cliente.documento,
          cliente_direccion: cliente.direccion,
          cliente_ciudad: cliente.ciudad,
          cliente_telefono: cliente.telefono,
          cliente_email: cliente.email,
          cliente_pais: cliente.pais,
          nota_remision: notaRemision,
          ...(esExpo ? op : {}),
          observaciones,
          items: items
            .filter((it) => it.descripcion.trim())
            .map((it) => ({
              codigo: it.codigo,
              descripcion: it.descripcion.trim(),
              unidad: it.unidad,
              cantidad: Number(it.cantidad) || 0,
              precio_unitario: Number(it.precio_unitario) || 0,
              descuento: Number(it.descuento) || 0,
              iva_tipo: it.iva_tipo,
            })),
          ...(reemiteId ? { regularizacion_id: reemiteId } : {}),
        }),
      });
      const j = await res.json();
      if (!res.ok || !j?.success) return setError(j?.error ?? "No se pudo guardar la factura.");
      const id = j.data?.factura?.id as string | undefined;
      if (accion === "borrador") {
        if (id) setBorradorId(id);
        setAviso("Borrador guardado. Todavía no tiene número: podés seguirlo desde el listado.");
        return;
      }
      if (id) window.open(`/api/facturas-exportacion/${id}/pdf`, "_blank");
      router.push(reemiteId ? "/facturas-exportacion/regularizacion" : "/facturas-exportacion");
    } finally {
      setEnviando("");
    }
  }

  const encabezado = (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Zentra · Autoimpresor</p>
      <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
        {reemiteId ? "Reemitir factura de agosto" : borradorId ? "Borrador de factura" : "Nueva factura"}
        {tipo && <span className="text-slate-400"> · {TIPOS_FACTURA[tipo].label}</span>}
      </h1>
      <p className="mt-0.5 text-xs text-slate-500">
        El número se pone solo al emitir. Un borrador se puede guardar y seguir después sin usar número.
      </p>
    </div>
  );

  if (!tipo) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {encabezado}
          <button type="button" onClick={() => router.push("/facturas-exportacion")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            ← Volver
          </button>
        </div>
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
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
    <form onSubmit={(e) => { e.preventDefault(); void guardar("emitir"); }} className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {encabezado}
        <div className="flex gap-2">
          {!borradorId && (
            <button type="button" onClick={() => setTipo(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Cambiar tipo
            </button>
          )}
          <button type="button" onClick={() => router.push(reemiteId ? "/facturas-exportacion/regularizacion" : "/facturas-exportacion")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            ← Volver
          </button>
        </div>
      </div>

      {esPrueba && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Modo prueba.</strong> Esta factura sale marcada como PRUEBA, sin valor fiscal, y no usa los números
          reales del timbrado.
        </div>
      )}
      {reemision && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Reemplaza la factura de agosto <strong>{reemision.numero_original}</strong> (timbrado {reemision.timbrado_original}).
          {esPrueba ? " En modo prueba no se vincula: la de agosto sigue pendiente." : " Al emitir quedan vinculadas."}
        </div>
      )}

      {/* Timbrado */}
      <div className="zx-surface p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={lbl}>Punto de expedición</label>
            <select value={punto} onChange={(e) => setPunto(e.target.value)} className={input}>
              {puntos.length === 0 && <option value="">Sin timbrado configurado</option>}
              {puntos.map((p) => (
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
          <div>
            <label className={lbl}>Próximo número{esPrueba ? " (prueba)" : ""}</label>
            <p className="py-2 font-mono text-sm text-slate-800">
              {cfg
                ? `${cfg.establecimiento}-${cfg.punto_expedicion}-${String(esPrueba ? cfg.proximo_numero_prueba : cfg.proximo_numero).padStart(7, "0")}`
                : "—"}
            </p>
          </div>
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
      <div className="zx-surface space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Datos del cliente</h2>
          {cliente.id && (
            <button type="button" onClick={() => setCliente({ ...clienteVacio })} className="text-xs text-slate-500 hover:underline">
              Cambiar cliente
            </button>
          )}
        </div>

        {!cliente.id && (
          <div className="relative">
            <label className={lbl}>Buscar en Clientes</label>
            <input
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setVerLista(true); }}
              onFocus={() => setVerLista(true)}
              onBlur={() => setTimeout(() => setVerLista(false), 150)}
              placeholder="Nombre, RUC o documento…"
              className={input}
            />
            {verLista && coincidencias.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {coincidencias.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => elegirCliente(c)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="font-medium text-slate-800">{nombreCliente(c)}</span>
                      <span className="text-xs text-slate-400">{[c.ruc || c.documento, c.pais].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-[11px] text-slate-400">Si no está en la lista, completá los datos abajo.</p>
          </div>
        )}

        {cliente.id && (
          <p className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            Cliente elegido de la lista. Los cambios que hagas acá quedan solo en esta factura.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <label className={lbl}>Nombre o razón social *</label>
            <input value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} className={input} />
          </div>
          <div>
            <label className={lbl}>{esExpo ? "Identificación fiscal / documento" : "RUC o C.I. Nº"}</label>
            <input value={cliente.documento} onChange={(e) => setCliente({ ...cliente, documento: e.target.value })} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>Dirección</label>
            <input value={cliente.direccion} onChange={(e) => setCliente({ ...cliente, direccion: e.target.value })} className={input} />
          </div>
          <div>
            <label className={lbl}>País *</label>
            <input value={cliente.pais} onChange={(e) => setCliente({ ...cliente, pais: e.target.value.toUpperCase() })} className={input} placeholder={esExpo ? "BOLIVIA" : "PARAGUAY"} />
          </div>
          <div>
            <label className={lbl}>Ciudad</label>
            <input value={cliente.ciudad} onChange={(e) => setCliente({ ...cliente, ciudad: e.target.value })} className={input} />
          </div>
          <div>
            <label className={lbl}>Teléfono</label>
            <input value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} className={input} />
          </div>
          <div>
            <label className={lbl}>Correo</label>
            <input type="email" value={cliente.email} onChange={(e) => setCliente({ ...cliente, email: e.target.value })} className={input} />
          </div>
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

        {!cliente.id && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={guardarCliente} onChange={(e) => setGuardarCliente(e.target.checked)} className="rounded" />
            Guardar este cliente en Clientes para la próxima vez
          </label>
        )}
      </div>

      {/* Moneda (para las dos) */}
      <div className={esExpo ? "grid grid-cols-1 gap-6 lg:grid-cols-2" : ""}>
        <div className="zx-surface space-y-4 p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-slate-800">{esExpo ? "Datos de la operación" : "Moneda"}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {esExpo && (
              <>
                <div>
                  <label className={lbl}>Tipo de operación</label>
                  <input value={op.tipo_operacion} onChange={(e) => setOp({ ...op, tipo_operacion: e.target.value })} className={input} />
                </div>
                <div>
                  <label className={lbl}>Condición de negociación (Incoterm)</label>
                  <input value={op.condicion_negociacion} onChange={(e) => setOp({ ...op, condicion_negociacion: e.target.value })} className={input} />
                </div>
              </>
            )}
            <div>
              <label className={lbl}>Moneda</label>
              <select value={moneda} onChange={(e) => { setMoneda(e.target.value); if (e.target.value === "PYG") setTipoCambio(""); }} className={input}>
                {MONEDAS_EXPORTACION.map((m) => (
                  <option key={m.codigo} value={m.codigo}>{m.label}</option>
                ))}
              </select>
            </div>
            {!esPyg && (
              <div>
                <label className={lbl}>Tipo de cambio a Gs. *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tipoCambio}
                  onChange={(e) => setTipoCambio(e.target.value)}
                  className={input}
                  placeholder={moneda === "USD" ? "Ej: 7850" : "Cotización del día"}
                />
              </div>
            )}
          </div>
        </div>

        {esExpo && (
          <div className="zx-surface space-y-4 p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-slate-800">Datos logísticos</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        )}
      </div>

      {/* Productos */}
      <div className="zx-surface p-4 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Productos</h2>
          <button
            type="button"
            onClick={() => setItems((p) => [...p, itemVacio(tipo)])}
            className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            + Agregar producto
          </button>
        </div>
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 lg:grid-cols-12">
                <div className="col-span-1 sm:col-span-2 lg:col-span-2">
                  <label className={lbl}>Código</label>
                  <input value={it.codigo} onChange={(e) => updateItem(i, "codigo", e.target.value)} className="zx-surface w-full px-2 py-1.5 text-sm" />
                </div>
                <div className="col-span-2 sm:col-span-4 lg:col-span-4">
                  <label className={lbl}>Descripción</label>
                  <input value={it.descripcion} onChange={(e) => updateItem(i, "descripcion", e.target.value)} className="zx-surface w-full px-2 py-1.5 text-sm" placeholder="Ej: SOFA MARTIN 3C" />
                </div>
                <div className="lg:col-span-1">
                  <label className={lbl}>Unidad</label>
                  <input value={it.unidad} onChange={(e) => updateItem(i, "unidad", e.target.value.toUpperCase())} className="zx-surface w-full px-2 py-1.5 text-sm" />
                </div>
                <div className="lg:col-span-1">
                  <label className={lbl}>Cantidad</label>
                  <input type="number" min="0" step="0.01" value={it.cantidad} onChange={(e) => updateItem(i, "cantidad", e.target.value)} className="zx-surface w-full px-2 py-1.5 text-right text-sm" />
                </div>
                <div className="sm:col-span-2 lg:col-span-2">
                  <label className={lbl}>Precio unitario</label>
                  <input type="number" min="0" step={dec ? "0.01" : "1"} value={it.precio_unitario} onChange={(e) => updateItem(i, "precio_unitario", e.target.value)} className="zx-surface w-full px-2 py-1.5 text-right text-sm" />
                </div>
                <div className="sm:col-span-2 lg:col-span-2">
                  <label className={lbl}>Descuento</label>
                  <input type="number" min="0" step={dec ? "0.01" : "1"} value={it.descuento} onChange={(e) => updateItem(i, "descuento", e.target.value)} className="zx-surface w-full px-2 py-1.5 text-right text-sm" placeholder="0" />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  {!esExpo && (
                    <select value={it.iva_tipo} onChange={(e) => updateItem(i, "iva_tipo", e.target.value)} className="zx-surface px-2 py-1 text-xs">
                      <option value="10">IVA 10%</option>
                      <option value="5">IVA 5%</option>
                      <option value="EXENTA">Exenta</option>
                    </select>
                  )}
                  <button type="button" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))} className="text-xs text-red-500 hover:text-red-700">
                    Quitar
                  </button>
                </div>
                <p className="text-sm tabular-nums text-slate-700">
                  Total ítem: <strong>{fmt(neto(it))}</strong>
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-end gap-6 text-sm">
          <div className="text-right text-xs text-slate-500">
            {!esExpo && (
              <p>
                Exentas {fmt(totalPor("EXENTA"))} · Gravado 5% {fmt(totalPor("5"))} · Gravado 10% {fmt(totalPor("10"))} ·
                IVA 5% {fmt(totalPor("5") / 21)} · IVA 10% {fmt(totalPor("10") / 11)}
              </p>
            )}
            {totalDescuento > 0 && <p>Descuentos: {fmt(totalDescuento)}</p>}
            {!esPyg && (
              <p>
                Equivalente: <strong className="text-slate-700">Gs. {tc > 1 ? fmt(Math.round(total * tc), 0) : "— (falta tipo de cambio)"}</strong>
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-slate-500">Total</p>
            <p className="text-xl font-bold tabular-nums text-slate-900">
              {esPyg ? "Gs." : moneda} {fmt(total)}
            </p>
          </div>
        </div>
      </div>

      <div className="zx-surface p-4 sm:p-6">
        <label className={lbl}>Observaciones</label>
        <textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={input} />
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {aviso && <div className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</div>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={!!enviando || !cfg || fueraVigencia}
          className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
        >
          {enviando === "emitir" ? "Emitiendo…" : esPrueba ? "Emitir factura de prueba" : "Emitir factura"}
        </button>
        <button
          type="button"
          onClick={() => void guardar("borrador")}
          disabled={!!enviando || !cfg}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {enviando === "borrador" ? "Guardando…" : "Guardar borrador"}
        </button>
        <button type="button" onClick={() => router.push("/facturas-exportacion")} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}
