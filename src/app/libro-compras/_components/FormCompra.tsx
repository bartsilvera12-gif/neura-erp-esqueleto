"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, ScanLine, Trash2 } from "lucide-react";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { preAsiento, totales, type LineaCalc } from "@/lib/compras-libro/calculo";
import AdjuntosPanel from "@/components/comex/AdjuntosPanel";
import HistorialPanel from "@/components/comex/HistorialPanel";
import { ModalPagoCuota, OrigenDinero } from "./ModalPago";
import {
  Aviso,
  ModalShell,
  api,
  btnPrimario,
  btnSecundario,
  fechaHora,
  hoyPY,
  inputClass,
  jsonInit,
  labelClass,
  noRueda,
  sinFlechas,
} from "@/components/comex/ui";

export interface TipoComprobante {
  id: string;
  codigo: number;
  nombre: string;
  uso: "COMPRA" | "VENTA";
  condicion: "CONTADO" | "CREDITO";
  es_nota_credito: boolean;
  cuenta_codigo: string | null;
  activo: boolean;
}
export interface ConfigCompras {
  cuenta_iva_credito: string;
  cuenta_proveedores: string;
  cuenta_retencion_iva: string | null;
  cuenta_retencion_renta: string | null;
  centro_costo_defecto: string;
  programa_defecto: string;
}
type Linea = {
  cuenta_codigo: string;
  centro_costo: string;
  programa: string;
  explicacion: string;
  exentas: string;
  gravadas: string;
  iva_porcentaje: 0 | 5 | 10;
};
type Cuota = { vencimiento: string; monto: string; pagare: string; pagado: string };
type Proveedor = { id: string; nombre: string; ruc: string | null };
type Cuenta = { id: string; cuenta: string; denominacion: string };

const IMPACTA: Record<string, string> = {
  SOLO_IVA: "Solo IVA",
  IVA_IRE: "IVA e IRE",
  SOLO_IRE: "Solo IRE",
  NO_IMPUTA: "No imputa",
};

const fmt = (n: number, moneda: string) => (moneda === "PYG" ? Math.round(n).toLocaleString("es-PY") : n.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const sumarMeses = (iso: string, m: number) => {
  const [y, mo, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(y, mo - 1 + m, 1));
  const ult = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
  f.setUTCDate(Math.min(d, ult));
  return f.toISOString().slice(0, 10);
};

/** Registro de un comprobante de compra (alta y edición). */
export default function FormCompra({ id }: { id?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const cajaParam = id ? null : params.get("caja");
  const { isAdmin } = useIsAdmin();
  const [tipos, setTipos] = useState<TipoComprobante[]>([]);
  const [config, setConfig] = useState<ConfigCompras | null>(null);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(!!id);
  const [estado, setEstado] = useState<"registrada" | "anulada">("registrada");
  const [meta, setMeta] = useState<{ numero: string; creado: string; por: string | null; mod: string; modPor: string | null; motivo: string | null } | null>(null);

  const [cdc, setCdc] = useState("");
  const [cdcInfo, setCdcInfo] = useState<{ tipo: "ok" | "error" | "info"; texto: string } | null>(null);
  const [tipoId, setTipoId] = useState("");
  const [fecha, setFecha] = useState(hoyPY);
  const [nro, setNro] = useState("");
  const [timbrado, setTimbrado] = useState("");
  const [esElectronica, setEsElectronica] = useState(false);
  const [proveedor, setProveedor] = useState<{ id: string | null; nombre: string; ruc: string }>({ id: null, nombre: "", ruc: "" });
  const [provAbierto, setProvAbierto] = useState(false);
  const [moneda, setMoneda] = useState("PYG");
  const [cotizacion, setCotizacion] = useState("");
  const [impacta, setImpacta] = useState("SOLO_IVA");
  const [explicacion, setExplicacion] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [retIva, setRetIva] = useState("");
  const [retRenta, setRetRenta] = useState("");
  const [cuotas, setCuotas] = useState<Cuota[]>([]);
  const [genCuotas, setGenCuotas] = useState({ cantidad: "1", primera: "", cada: "mensual" });
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [anular, setAnular] = useState(false);
  const [recargaHist, setRecargaHist] = useState(0);
  // De dónde sale el dinero (contado): cuenta bancaria o caja chica.
  const [pagoMedio, setPagoMedio] = useState(cajaParam ? "CAJA_CHICA" : "");
  const [pagoCuenta, setPagoCuenta] = useState(cajaParam ?? "");
  const [pagoRef, setPagoRef] = useState("");
  type PagoReg = { id: string; cuota_nro: number | null; fecha: string; monto: number; medio: string; referencia: string | null; usuario_nombre: string | null };
  const [pagos, setPagos] = useState<PagoReg[]>([]);
  const [pagarCuota, setPagarCuota] = useState<{ nro: number; saldo: number } | null>(null);
  const [anularPago, setAnularPago] = useState<PagoReg | null>(null);

  const tiposCompra = tipos.filter((t) => t.uso === "COMPRA" && (t.activo || t.id === tipoId));
  const tipo = tipos.find((t) => t.id === tipoId) ?? null;
  const esNC = tipo?.es_nota_credito === true;
  // Una nota de crédito a crédito solo baja la deuda con el proveedor: no tiene cuotas.
  const credito = tipo?.condicion === "CREDITO" && !esNC;
  const conPagos = cuotas.some((c) => Number(c.pagado) > 0);
  const bloqueado = estado === "anulada";
  const lineaVacia = (): Linea => ({
    cuenta_codigo: "",
    centro_costo: config?.centro_costo_defecto ?? "1.00.00",
    programa: config?.programa_defecto ?? "1.00",
    explicacion: "",
    exentas: "",
    gravadas: "",
    iva_porcentaje: 10,
  });

  useEffect(() => {
    api<{ tipos: TipoComprobante[]; config: ConfigCompras }>("/api/libro-compras/config")
      .then((d) => {
        setTipos(d.tipos);
        setConfig(d.config);
        if (cajaParam) {
          const cc = d.tipos.find((x) => x.codigo === 5 && x.activo);
          if (cc) setTipoId(cc.id);
        }
        if (!id) setLineas([{ cuenta_codigo: "", centro_costo: d.config.centro_costo_defecto, programa: d.config.programa_defecto, explicacion: "", exentas: "", gravadas: "", iva_porcentaje: 10 }]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
    fetchWithSupabaseSession("/api/proveedores", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setProveedores((j.data?.proveedores ?? []) as Proveedor[]))
      .catch(() => undefined);
    fetchWithSupabaseSession("/api/plan-cuentas/opciones", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setCuentas((j.data?.cuentas ?? []) as Cuenta[]))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const cargarPagos = () =>
    id
      ? api<{ pagos: PagoReg[] }>(`/api/libro-compras/${id}/pagos`).then((d) => {
          setPagos(d.pagos);
          return d.pagos;
        })
      : Promise.resolve([] as PagoReg[]);

  // Edición: carga el comprobante.
  useEffect(() => {
    if (!id) return;
    api<{ compra: Record<string, unknown>; lineas: Record<string, unknown>[]; cuotas: Record<string, unknown>[] }>(`/api/libro-compras/${id}`)
      .then(({ compra: c, lineas: ls, cuotas: qs }) => {
        const s = (v: unknown) => (v == null ? "" : String(v));
        setTipoId(s(c.tipo_id));
        setFecha(s(c.fecha));
        setNro(s(c.nro_comprobante));
        setTimbrado(s(c.timbrado));
        setEsElectronica(c.es_electronica === true);
        setCdc(s(c.cdc));
        setProveedor({ id: (c.proveedor_id as string) ?? null, nombre: s(c.proveedor_nombre), ruc: s(c.proveedor_ruc) });
        setMoneda(s(c.moneda) || "PYG");
        setCotizacion(c.moneda === "PYG" ? "" : s(c.cotizacion));
        setImpacta(s(c.impacta) || "SOLO_IVA");
        setExplicacion(s(c.explicacion));
        setRetIva(Number(c.retencion_iva) ? s(c.retencion_iva) : "");
        setRetRenta(Number(c.retencion_renta) ? s(c.retencion_renta) : "");
        setEstado(c.estado === "anulada" ? "anulada" : "registrada");
        setMeta({ numero: s(c.numero_control), creado: s(c.created_at), por: (c.created_by_nombre as string) ?? null, mod: s(c.updated_at), modPor: (c.updated_by_nombre as string) ?? null, motivo: (c.anulada_motivo as string) ?? null });
        setLineas(
          ls.map((l) => ({
            cuenta_codigo: s(l.cuenta_codigo),
            centro_costo: s(l.centro_costo),
            programa: s(l.programa),
            explicacion: s(l.explicacion),
            exentas: Number(l.exentas) ? s(l.exentas) : "",
            gravadas: Number(l.gravadas) ? s(l.gravadas) : "",
            iva_porcentaje: (Number(l.iva_porcentaje) as 0 | 5 | 10) ?? 10,
          }))
        );
        setCuotas(qs.map((q) => ({ vencimiento: s(q.vencimiento), monto: s(q.monto), pagare: s(q.pagare), pagado: Number(q.pagado) ? s(q.pagado) : "" })));
        // Hasta tener los pagos no se muestra el formulario: si no, guardar borraría el pago de contado.
        return cargarPagos().then((ps) => {
          const contado = (ps as (PagoReg & { entidad_bancaria_id?: string | null; caja_chica_id?: string | null })[]).find((x) => x.cuota_nro === null);
          if (contado) {
            setPagoMedio(contado.medio);
            setPagoCuenta((contado.entidad_bancaria_id ?? contado.caja_chica_id) || "");
            setPagoRef(contado.referencia ?? "");
          }
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setCargando(false));
  }, [id]);

  // Texto por defecto de cada renglón, como en el sistema anterior: "TIPO PROVEEDOR NÚMERO".
  const explicacionDefecto = [tipo?.nombre, proveedor.nombre, nro].filter(Boolean).join(" ");
  const lineasCalc: LineaCalc[] = lineas.map((l) => ({
    cuenta_codigo: l.cuenta_codigo || null,
    exentas: Number(l.exentas) || 0,
    gravadas: Number(l.gravadas) || 0,
    iva_porcentaje: l.iva_porcentaje,
    imputa_iva: impacta !== "NO_IMPUTA" && impacta !== "SOLO_IRE",
  }));
  const t = totales(lineasCalc, moneda);
  const aPagar = t.total - (Number(retIva) || 0) - (Number(retRenta) || 0);
  const asiento = useMemo(
    () =>
      config && tipo
        ? preAsiento({
            lineas: lineasCalc,
            moneda,
            condicion: tipo.condicion,
            esNotaCredito: tipo.es_nota_credito,
            cuentaTipo: tipo.cuenta_codigo,
            cuentaIva: config.cuenta_iva_credito,
            cuentaProveedores: config.cuenta_proveedores,
            cuentaRetIva: config.cuenta_retencion_iva,
            cuentaRetRenta: config.cuenta_retencion_renta,
            retencionIva: Number(retIva) || 0,
            retencionRenta: Number(retRenta) || 0,
            detalle: explicacionDefecto,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(lineasCalc), moneda, tipo, config, retIva, retRenta, explicacionDefecto]
  );
  const nombreCuenta = new Map(cuentas.map((c) => [c.cuenta, c.denominacion]));

  async function precargarCdc() {
    setCdcInfo(null);
    try {
      const d = await api<{ cdc: string; ruc: string; dv: string; numero: string; fecha: string; tipoDocumento: string; proveedor: Proveedor | null; ya_cargado: string | null }>(
        `/api/libro-compras/cdc?cdc=${encodeURIComponent(cdc)}`
      );
      setCdc(d.cdc);
      setNro(d.numero);
      setFecha(d.fecha);
      setEsElectronica(true);
      if (d.proveedor) setProveedor({ id: d.proveedor.id, nombre: d.proveedor.nombre, ruc: d.proveedor.ruc ?? `${d.ruc}-${d.dv}` });
      else setProveedor((p) => ({ ...p, id: null, ruc: `${d.ruc}-${d.dv}` }));
      if (!tipoId) {
        const contado = tiposCompra.find((x) => x.codigo === 1);
        if (contado) setTipoId(contado.id);
      }
      setCdcInfo(
        d.ya_cargado
          ? { tipo: "error", texto: `Este CDC ya está cargado en ${d.ya_cargado}.` }
          : {
              tipo: d.proveedor ? "ok" : "info",
              texto:
                `${d.tipoDocumento} ${d.numero} del ${d.fecha.split("-").reverse().join("/")}. ` +
                (d.proveedor
                  ? `Proveedor: ${d.proveedor.nombre}.`
                  : `El RUC ${d.ruc}-${d.dv} no está en Proveedores: escribí el nombre o dalo de alta en Compras → Proveedores.`) +
                " Completá el timbrado y los montos.",
            }
      );
    } catch (e) {
      setCdcInfo({ tipo: "error", texto: e instanceof Error ? e.message : "Error" });
    }
  }

  function generarCuotas() {
    const n = Math.max(1, Math.min(60, Number(genCuotas.cantidad) || 1));
    const primera = genCuotas.primera || fecha;
    const r = (x: number) => (moneda === "PYG" ? Math.round(x) : Math.round(x * 100) / 100);
    const base = r(aPagar / n);
    setCuotas(
      Array.from({ length: n }, (_, i) => ({
        vencimiento:
          genCuotas.cada === "mensual" ? sumarMeses(primera, i) : new Date(Date.parse(primera) + i * Number(genCuotas.cada) * 86400000).toISOString().slice(0, 10),
        monto: String(i === n - 1 ? r(aPagar - base * (n - 1)) : base),
        pagare: "",
        pagado: "",
      }))
    );
  }

  function payload() {
    return {
      tipo_id: tipoId,
      fecha,
      nro_comprobante: nro,
      timbrado,
      es_electronica: esElectronica,
      cdc: cdc.replace(/\D/g, "") || null,
      proveedor_id: proveedor.id,
      proveedor_nombre: proveedor.nombre,
      proveedor_ruc: proveedor.ruc,
      moneda,
      cotizacion: Number(cotizacion) || 1,
      impacta,
      explicacion,
      retencion_iva: Number(retIva) || 0,
      retencion_renta: Number(retRenta) || 0,
      lineas: lineas.map((l) => ({
        cuenta_codigo: l.cuenta_codigo,
        centro_costo: l.centro_costo,
        programa: l.programa,
        explicacion: l.explicacion || explicacionDefecto,
        exentas: Number(l.exentas) || 0,
        gravadas: Number(l.gravadas) || 0,
        iva_porcentaje: l.iva_porcentaje,
        imputa_iva: impacta !== "NO_IMPUTA" && impacta !== "SOLO_IRE",
        formulario: l.iva_porcentaje ? "Form120-R6-a" : null,
      })),
      cuotas_detalle: credito ? cuotas.map((c) => ({ vencimiento: c.vencimiento, monto: Number(c.monto) || 0, pagare: c.pagare, pagado: Number(c.pagado) || 0 })) : [],
      pago: tipo?.condicion === "CONTADO" && pagoMedio && pagoCuenta ? { medio: pagoMedio, cuenta_id: pagoCuenta, referencia: pagoRef } : null,
    };
  }

  async function guardar(yNuevo: boolean) {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const d = id
        ? await api<{ id: string; numero_control: string; aviso: string | null }>(`/api/libro-compras/${id}`, jsonInit("PUT", payload()))
        : await api<{ id: string; numero_control: string; aviso: string | null }>("/api/libro-compras", jsonInit("POST", payload()));
      if (yNuevo) {
        // Se queda en la pantalla para cargar el siguiente (conserva tipo, fecha y moneda).
        setCdc("");
        setCdcInfo(null);
        setNro("");
        setTimbrado("");
        setEsElectronica(false);
        setProveedor({ id: null, nombre: "", ruc: "" });
        setExplicacion("");
        setLineas([lineaVacia()]);
        setRetIva("");
        setRetRenta("");
        setCuotas([]);
        setAviso(`Se guardó ${d.numero_control}. Podés cargar el siguiente.${d.aviso ? ` Ojo: ${d.aviso}` : ""}`);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (!id) router.push(cajaParam ? `/tesoreria/caja/${cajaParam}` : `/libro-compras/${d.id}`);
      else {
        setAviso(`Cambios guardados.${d.aviso ? ` Ojo: ${d.aviso}` : ""}`);
        setRecargaHist((n) => n + 1);
        void cargarPagos();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setGuardando(false);
    }
  }

  const setL = (i: number, k: keyof Linea, v: string | number) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const num = `${inputClass} ${sinFlechas} text-right`;
  const provFiltrados = proveedores
    .filter((p) => !proveedor.nombre || p.nombre.toLowerCase().includes(proveedor.nombre.toLowerCase()) || (p.ruc ?? "").includes(proveedor.nombre))
    .slice(0, 20);

  if (cargando) return <p className="text-sm text-slate-500">Cargando…</p>;

  return (
    <div className="space-y-5">
      <Link href="/libro-compras" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Libro de compras
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Compras</p>
          <h1 className="text-2xl font-semibold text-slate-900">{id ? `Comprobante ${meta?.numero ?? ""}` : "Registrar comprobante de compra"}</h1>
          {meta && (
            <p className="text-xs text-slate-500">
              Creado por {meta.por ?? "—"} el {fechaHora(meta.creado)} · Última modificación {fechaHora(meta.mod)} {meta.modPor ? `por ${meta.modPor}` : ""}
            </p>
          )}
        </div>
      </header>
      {bloqueado && (
        <Aviso>
          <strong>Comprobante anulado.</strong> Motivo: {meta?.motivo ?? "—"}
        </Aviso>
      )}

      <fieldset disabled={bloqueado} className="space-y-5">
        {/* CDC */}
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <label className={labelClass}>¿Es factura electrónica? Pegá el CDC y se completa solo</label>
          <div className="flex flex-wrap gap-2">
            <input
              value={cdc}
              onChange={(e) => setCdc(e.target.value)}
              placeholder="44 números (está en el KuDE, arriba o abajo del QR)"
              className={`${inputClass} min-w-[280px] flex-1 font-mono`}
            />
            <button type="button" onClick={() => void precargarCdc()} disabled={!cdc.trim()} className={btnPrimario}>
              <ScanLine className="h-3.5 w-3.5" /> Completar con el CDC
            </button>
          </div>
          {cdcInfo && (
            <div className="mt-2">
              <Aviso tipo={cdcInfo.tipo}>{cdcInfo.texto}</Aviso>
            </div>
          )}
        </section>

        {/* Datos */}
        <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className={labelClass}>Tipo de comprobante *</label>
            <select value={tipoId} onChange={(e) => setTipoId(e.target.value)} className={inputClass}>
              <option value="">— Elegir —</option>
              {tiposCompra.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.codigo} · {x.nombre}
                </option>
              ))}
            </select>
            {tipo && (
              <p className="mt-1 text-[11px] text-slate-500">
                {tipo.condicion === "CREDITO" ? "A crédito: se cargan las cuotas." : "Al contado."}
                {tipo.es_nota_credito && " Nota de crédito: el asiento va al revés."}
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>Fecha *</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>N° comprobante *</label>
            <input value={nro} onChange={(e) => setNro(e.target.value)} placeholder="001-001-0000001" className={`${inputClass} font-mono`} />
          </div>
          <div className="relative sm:col-span-2">
            <label className={labelClass}>Proveedor *</label>
            <input
              value={proveedor.nombre}
              onChange={(e) => {
                setProveedor({ id: null, nombre: e.target.value, ruc: proveedor.ruc });
                setProvAbierto(true);
              }}
              onFocus={() => setProvAbierto(true)}
              onBlur={() => setTimeout(() => setProvAbierto(false), 150)}
              placeholder="Buscá por nombre o RUC"
              className={inputClass}
            />
            {provAbierto && provFiltrados.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {provFiltrados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setProveedor({ id: p.id, nombre: p.nombre, ruc: p.ruc ?? "" });
                      setProvAbierto(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"
                  >
                    {p.nombre} {p.ruc && <span className="ml-1 font-mono text-xs text-slate-400">{p.ruc}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className={labelClass}>RUC</label>
            <input value={proveedor.ruc} onChange={(e) => setProveedor({ ...proveedor, ruc: e.target.value })} className={`${inputClass} font-mono`} />
          </div>
          <div>
            <label className={labelClass}>Timbrado {tipo?.codigo === 12 ? "" : "*"}</label>
            <input value={timbrado} onChange={(e) => setTimbrado(e.target.value.replace(/\D/g, ""))} className={`${inputClass} font-mono`} />
          </div>
          <div>
            <label className={labelClass}>Moneda</label>
            <select
              value={moneda}
              onChange={(e) => {
                setMoneda(e.target.value);
                // Las cuentas son de una sola moneda: hay que volver a elegir.
                setPagoMedio("");
                setPagoCuenta("");
              }}
              className={inputClass}
            >
              <option value="PYG">Guaraníes</option>
              <option value="USD">Dólares</option>
              <option value="BOB">Bolivianos</option>
            </select>
          </div>
          {moneda !== "PYG" && (
            <div>
              <label className={labelClass}>Cotización *</label>
              <input type="number" min={0} step="any" value={cotizacion} onWheel={noRueda} onChange={(e) => setCotizacion(e.target.value)} className={num} />
            </div>
          )}
          <div>
            <label className={labelClass}>Impacta</label>
            <select value={impacta} onChange={(e) => setImpacta(e.target.value)} className={inputClass}>
              {Object.entries(IMPACTA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={esElectronica} onChange={(e) => setEsElectronica(e.target.checked)} /> Es electrónica
          </label>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className={labelClass}>Explicación</label>
            <input value={explicacion} onChange={(e) => setExplicacion(e.target.value)} placeholder="Ej.: material de limpieza" className={inputClass} />
          </div>
        </section>

        {/* Renglones */}
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">Detalle (libro de compras)</h2>
            <p className="text-xs text-slate-500">En “Gravadas” va el monto con IVA incluido, como está en la factura.</p>
          </div>
          <datalist id="plan-cuentas">
            {cuentas.map((c) => (
              <option key={c.id} value={c.cuenta}>
                {c.denominacion}
              </option>
            ))}
          </datalist>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-2">Cuenta *</th>
                  <th className="py-2 pr-2">Centro de costo</th>
                  <th className="py-2 pr-2">Programa</th>
                  <th className="py-2 pr-2">Explicación</th>
                  <th className="py-2 pr-2 text-right">Exentas</th>
                  <th className="py-2 pr-2 text-right">Gravadas</th>
                  <th className="py-2 pr-2">IVA</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100 align-top">
                    <td className="py-1.5 pr-2">
                      <input list="plan-cuentas" value={l.cuenta_codigo} onChange={(e) => setL(i, "cuenta_codigo", e.target.value)} placeholder="1.01.04.06.000" className={`${inputClass} w-36 font-mono`} />
                      {nombreCuenta.get(l.cuenta_codigo) && <p className="mt-0.5 max-w-[9rem] truncate text-[10px] text-slate-500">{nombreCuenta.get(l.cuenta_codigo)}</p>}
                    </td>
                    <td className="py-1.5 pr-2">
                      <input value={l.centro_costo} onChange={(e) => setL(i, "centro_costo", e.target.value)} className={`${inputClass} w-24 font-mono`} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input value={l.programa} onChange={(e) => setL(i, "programa", e.target.value)} className={`${inputClass} w-20 font-mono`} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input value={l.explicacion} onChange={(e) => setL(i, "explicacion", e.target.value)} placeholder={explicacionDefecto || "Se completa sola"} className={`${inputClass} min-w-[200px]`} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input type="number" min={0} step="any" value={l.exentas} onWheel={noRueda} onChange={(e) => setL(i, "exentas", e.target.value)} className={`${num} w-28`} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input type="number" min={0} step="any" value={l.gravadas} onWheel={noRueda} onChange={(e) => setL(i, "gravadas", e.target.value)} className={`${num} w-28`} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select value={l.iva_porcentaje} onChange={(e) => setL(i, "iva_porcentaje", Number(e.target.value))} className={`${inputClass} w-24`}>
                        <option value={10}>10%</option>
                        <option value={5}>5%</option>
                        <option value={0}>Sin IVA</option>
                      </select>
                    </td>
                    <td className="py-1.5">
                      {lineas.length > 1 && (
                        <button type="button" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Quitar renglón">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={() => setLineas((ls) => [...ls, lineaVacia()])} className={btnSecundario}>
            <Plus className="h-3.5 w-3.5" /> Agregar renglón
          </button>
          <div className="ml-auto grid max-w-sm grid-cols-2 gap-x-6 gap-y-1 border-t border-slate-100 pt-3 text-sm">
            <span className="text-slate-500">Subtotal sin IVA</span>
            <span className="text-right">{fmt(t.subtotalSinIva, moneda)}</span>
            {t.iva10 > 0 && (
              <>
                <span className="text-slate-500">IVA 10%</span>
                <span className="text-right">{fmt(t.iva10, moneda)}</span>
              </>
            )}
            {t.iva5 > 0 && (
              <>
                <span className="text-slate-500">IVA 5%</span>
                <span className="text-right">{fmt(t.iva5, moneda)}</span>
              </>
            )}
            <span className="font-semibold text-slate-800">Total</span>
            <span className="text-right text-lg font-semibold">
              {moneda === "PYG" ? "Gs." : moneda} {fmt(t.total, moneda)}
            </span>
          </div>
        </section>

        {/* De dónde sale el dinero (contado) */}
        {tipo && tipo.condicion === "CONTADO" && (
          <section className="space-y-3 rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">{esNC ? "¿A dónde vuelve el dinero?" : "¿De dónde sale el dinero?"}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <OrigenDinero moneda={moneda} medio={pagoMedio} cuentaId={pagoCuenta} permitirNinguno onChange={(m, c) => { setPagoMedio(m); setPagoCuenta(c); }} />
              </div>
              <input value={pagoRef} onChange={(e) => setPagoRef(e.target.value)} placeholder="N° de cheque o transferencia" className={inputClass} />
            </div>
            <p className="text-xs text-slate-500">
              {pagoCuenta
                ? esNC
                  ? `Al guardar se suman ${fmt(aPagar, moneda)} a esa cuenta (devolución del proveedor).`
                  : `Al guardar se descuentan ${fmt(aPagar, moneda)} de esa cuenta.`
                : esNC
                  ? "Si no elegís una cuenta, la nota queda registrada pero la devolución no se suma a ningún lado."
                  : "Si no elegís una cuenta, el comprobante queda registrado pero el pago no se descuenta de ningún lado."}
            </p>
          </section>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Retenciones */}
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">Retenciones</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Retención IVA</label>
                <input type="number" min={0} step="any" value={retIva} onWheel={noRueda} onChange={(e) => setRetIva(e.target.value)} placeholder="0" className={num} />
              </div>
              <div>
                <label className={labelClass}>Retención renta</label>
                <input type="number" min={0} step="any" value={retRenta} onWheel={noRueda} onChange={(e) => setRetRenta(e.target.value)} placeholder="0" className={num} />
              </div>
            </div>
            {(Number(retIva) > 0 || Number(retRenta) > 0) && (
              <p className="text-xs text-slate-500">
                A pagar al proveedor: <strong>{fmt(aPagar, moneda)}</strong>
              </p>
            )}
          </section>

          {/* Cuotas */}
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">Vencimientos</h2>
            {!credito ? (
              <p className="text-sm text-slate-500">
                {esNC && tipo?.condicion === "CREDITO" ? "Nota de crédito a crédito: baja la deuda con el proveedor, no tiene cuotas." : "Al contado no tiene cuotas."}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className={labelClass}>Cuotas</label>
                    <input type="number" min={1} max={60} value={genCuotas.cantidad} onWheel={noRueda} onChange={(e) => setGenCuotas({ ...genCuotas, cantidad: e.target.value })} className={`${num} w-20`} />
                  </div>
                  <div>
                    <label className={labelClass}>Primer vencimiento</label>
                    <input type="date" value={genCuotas.primera} onChange={(e) => setGenCuotas({ ...genCuotas, primera: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Cada</label>
                    <select value={genCuotas.cada} onChange={(e) => setGenCuotas({ ...genCuotas, cada: e.target.value })} className={inputClass}>
                      <option value="mensual">Mes</option>
                      <option value="15">15 días</option>
                      <option value="30">30 días</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={generarCuotas}
                    disabled={!(aPagar > 0) || conPagos}
                    title={conPagos ? "Ya hay cuotas con pagos: cambiá los montos a mano o anulá los pagos." : undefined}
                    className={btnSecundario}
                  >
                    Generar
                  </button>
                </div>
                {cuotas.length > 0 && (
                  <table className="w-full text-sm">
                    <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="py-1">N°</th>
                        <th className="py-1">Vence</th>
                        <th className="py-1 text-right">A pagar</th>
                        <th className="py-1 text-right">Pagado</th>
                        <th className="py-1">Pagaré</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuotas.map((c, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-1 pr-2">{i + 1}</td>
                          <td className="py-1 pr-2">
                            <input type="date" value={c.vencimiento} onChange={(e) => setCuotas((cs) => cs.map((x, j) => (j === i ? { ...x, vencimiento: e.target.value } : x)))} className={inputClass} />
                          </td>
                          <td className="py-1 pr-2">
                            <input type="number" min={0} step="any" value={c.monto} onWheel={noRueda} onChange={(e) => setCuotas((cs) => cs.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))} className={`${num} w-28`} />
                          </td>
                          <td className="py-1 pr-2 text-right whitespace-nowrap">
                            {fmt(Number(c.pagado) || 0, moneda)}
                            {id && !bloqueado && (Number(c.monto) || 0) - (Number(c.pagado) || 0) > 0 && (
                              <button
                                type="button"
                                onClick={() => setPagarCuota({ nro: i + 1, saldo: (Number(c.monto) || 0) - (Number(c.pagado) || 0) })}
                                className="ml-2 rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                              >
                                Pagar
                              </button>
                            )}
                          </td>
                          <td className="py-1">
                            <input value={c.pagare} onChange={(e) => setCuotas((cs) => cs.map((x, j) => (j === i ? { ...x, pagare: e.target.value } : x)))} className={`${inputClass} w-24`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {cuotas.length > 0 && (
                  <p className="text-xs text-slate-500">
                    Suman {fmt(cuotas.reduce((s, c) => s + (Number(c.monto) || 0), 0), moneda)} de {fmt(aPagar, moneda)} · Saldo pendiente{" "}
                    {fmt(cuotas.reduce((s, c) => s + (Number(c.monto) || 0) - (Number(c.pagado) || 0), 0), moneda)}
                  </p>
                )}
              </>
            )}
          </section>
        </div>

        {/* Pre-asiento */}
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">Pre-asiento</h2>
            <p className="text-xs text-slate-500">Vista previa: todavía no se registra en Contabilidad.</p>
          </div>
          {!asiento ? (
            <p className="text-sm text-slate-500">Elegí el tipo de comprobante para verlo.</p>
          ) : (
            <>
              {asiento.avisos.map((a) => (
                <Aviso key={a} tipo="info">
                  {a}
                </Aviso>
              ))}
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-1">Cuenta</th>
                    <th className="py-1">Detalle</th>
                    <th className="py-1 text-right">Debe</th>
                    <th className="py-1 text-right">Haber</th>
                  </tr>
                </thead>
                <tbody>
                  {asiento.lineas.map((a, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-1 font-mono text-xs">
                        {a.cuenta}
                        {nombreCuenta.get(a.cuenta) && <span className="ml-2 font-sans text-slate-500">{nombreCuenta.get(a.cuenta)}</span>}
                      </td>
                      <td className="py-1 text-xs text-slate-600">{a.detalle}</td>
                      <td className="py-1 text-right">{a.debe ? fmt(a.debe, moneda) : ""}</td>
                      <td className="py-1 text-right">{a.haber ? fmt(a.haber, moneda) : ""}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-300 font-semibold">
                    <td colSpan={2} className="py-1 text-right text-xs uppercase text-slate-500">
                      Totales
                    </td>
                    <td className="py-1 text-right">{fmt(asiento.lineas.reduce((s, a) => s + a.debe, 0), moneda)}</td>
                    <td className="py-1 text-right">{fmt(asiento.lineas.reduce((s, a) => s + a.haber, 0), moneda)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </section>
      </fieldset>

      {error && <Aviso>{error}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

      {!bloqueado && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void guardar(false)} disabled={guardando} className={`${btnPrimario} px-4 py-2 text-sm`}>
            {guardando ? "Guardando…" : id ? "Guardar cambios" : "Guardar"}
          </button>
          {!id && (
            <button onClick={() => void guardar(true)} disabled={guardando} className={`${btnSecundario} px-4 py-2 text-sm`}>
              Guardar y cargar otro
            </button>
          )}
          {id && isAdmin && (
            <button onClick={() => setAnular(true)} className={`${btnSecundario} px-4 py-2 text-sm text-rose-600`}>
              Anular
            </button>
          )}
        </div>
      )}

      {id && pagos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-800">Pagos registrados</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {pagos.map((pg) => (
              <div key={pg.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 text-sm first:border-t-0">
                <span>
                  {pg.fecha.split("-").reverse().join("/")} · {pg.cuota_nro ? `Cuota ${pg.cuota_nro}` : "Contado"} · {pg.medio === "BANCO" ? "Banco" : "Caja chica"}
                  {pg.referencia ? ` · ${pg.referencia}` : ""}
                  <span className="ml-2 text-xs text-slate-400">{pg.usuario_nombre ?? ""}</span>
                </span>
                <span className="flex items-center gap-3">
                  <strong>{fmt(Number(pg.monto), moneda)}</strong>
                  {isAdmin && !bloqueado && pg.cuota_nro !== null && (
                    <button onClick={() => setAnularPago(pg)} className="text-xs text-rose-600 hover:underline">
                      Anular
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {pagarCuota && id && (
        <ModalPagoCuota
          compraId={id}
          cuotaNro={pagarCuota.nro}
          saldo={pagarCuota.saldo}
          moneda={moneda}
          titulo={`Pagar cuota ${pagarCuota.nro}`}
          onClose={() => setPagarCuota(null)}
          onDone={(a) => {
            setPagarCuota(null);
            setAviso(a ? `Pago registrado. Ojo: ${a}` : "Pago registrado.");
            void cargarPagos();
            api<{ cuotas: Record<string, unknown>[] }>(`/api/libro-compras/${id}`).then((d) =>
              setCuotas(d.cuotas.map((q) => ({ vencimiento: String(q.vencimiento), monto: String(q.monto), pagare: String(q.pagare ?? ""), pagado: String(q.pagado ?? "") })))
            );
            setRecargaHist((n) => n + 1);
          }}
        />
      )}
      {anularPago && id && (
        <ModalAnularPago
          compraId={id}
          pagoId={anularPago.id}
          onClose={() => setAnularPago(null)}
          onDone={() => window.location.reload()}
        />
      )}

      {id && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-800">Imágenes y documentos</h2>
            <AdjuntosPanel origenTipo="COMPRA" origenId={id} bloqueado={bloqueado} />
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-800">Historial</h2>
            <HistorialPanel origenTipo="COMPRA" origenId={id} recarga={recargaHist} />
          </section>
        </div>
      )}
      {!id && <p className="text-xs text-slate-400">Después de guardar se pueden adjuntar la foto o el PDF del comprobante.</p>}

      {anular && id && (
        <ModalAnular
          id={id}
          onClose={() => setAnular(false)}
          onDone={() => window.location.reload()}
        />
      )}
    </div>
  );
}

function ModalAnular({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ModalShell title="Anular comprobante" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">El comprobante queda en el libro marcado como anulado, con el motivo. No suma en los totales.</p>
        <div>
          <label className={labelClass}>Motivo *</label>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className={inputClass} autoFocus />
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnSecundario}>
            Cancelar
          </button>
          <button
            disabled={saving || !motivo.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await api(`/api/libro-compras/${id}/anular`, jsonInit("POST", { motivo }));
                onDone();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Error");
                setSaving(false);
              }
            }}
            className="inline-flex items-center rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            Anular
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalAnularPago({ compraId, pagoId, onClose, onDone }: { compraId: string; pagoId: string; onClose: () => void; onDone: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ModalShell title="Anular pago" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">La plata vuelve a la cuenta de donde salió y la cuota queda otra vez pendiente.</p>
        <div>
          <label className={labelClass}>Motivo *</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputClass} autoFocus />
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnSecundario}>Cancelar</button>
          <button
            disabled={saving || !motivo.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await api(`/api/libro-compras/${compraId}/pagos?pagoId=${pagoId}&motivo=${encodeURIComponent(motivo)}`, { method: "DELETE" });
                onDone();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Error");
                setSaving(false);
              }
            }}
            className="inline-flex items-center rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            Anular pago
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
