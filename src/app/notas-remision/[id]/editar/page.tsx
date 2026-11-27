"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Truck, Save } from "lucide-react";
import { fetchDepositos, fetchNR, fetchStockDeposito, type Deposito, type StockItem } from "@/lib/multideposito/client";
import { useIsAdmin } from "@/lib/auth/use-is-admin";

type ClienteLite = { id: string; label: string; direccion: string; ciudad: string };
type Linea = { producto_id: string; nombre: string; sku: string; cantidad: number };

const inp = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

export default function EditarNRPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin, loaded } = useIsAdmin();
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [numero, setNumero] = useState("");
  const [timbrado, setTimbrado] = useState("");
  const [estado, setEstado] = useState("");
  const [fechaOrig, setFechaOrig] = useState("");
  const [fecha, setFecha] = useState("");
  const [emisor, setEmisor] = useState("");
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [destinoTipo, setDestinoTipo] = useState<"deposito" | "cliente">("deposito");
  const [clienteId, setClienteId] = useState("");
  const [destNombre, setDestNombre] = useState("");
  const [destDireccion, setDestDireccion] = useState("");
  const [destCiudad, setDestCiudad] = useState("");
  const [motivo, setMotivo] = useState("traslado");
  const [transportista, setTransportista] = useState("");
  const [rucTransp, setRucTransp] = useState("");
  const [conductor, setConductor] = useState("");
  const [ciConductor, setCiConductor] = useState("");
  const [chapa, setChapa] = useState("");
  const [marca, setMarca] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [docOrigen, setDocOrigen] = useState("");
  const [obs, setObs] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [r, d] = await Promise.all([fetchNR(id), fetchDepositos()]);
      if (d.ok) setDepositos(d.data.depositos);
      if (!r.ok) { setError(r.error); setCargando(false); return; }
      const n = r.data.nota_remision;
      setNumero(n.numero);
      setTimbrado(n.timbrado ?? "");
      setEstado(n.estado);
      setFechaOrig((n.fecha ?? "").slice(0, 10));
      setFecha((n.fecha ?? "").slice(0, 10));
      setEmisor(n.emisor ?? "");
      setOrigen(n.ubicacion_origen_id);
      setDestino(n.ubicacion_destino_id ?? "");
      setDestinoTipo(n.destino_tipo === "cliente" ? "cliente" : "deposito");
      setClienteId(n.cliente_id ?? "");
      setDestNombre(n.destino_nombre ?? "");
      setDestDireccion(n.destino_direccion ?? "");
      setDestCiudad(n.destino_ciudad ?? "");
      setMotivo(n.motivo);
      setTransportista(n.transportista ?? "");
      setRucTransp(n.ruc_transportista ?? "");
      setConductor(n.conductor ?? "");
      setCiConductor(n.ci_conductor ?? "");
      setChapa(n.chapa ?? "");
      setMarca(n.marca_vehiculo ?? "");
      setFechaInicio((n.fecha_inicio_traslado ?? "").slice(0, 10));
      setFechaFin((n.fecha_fin_traslado ?? "").slice(0, 10));
      setDocOrigen(n.documento_origen ?? "");
      setObs(n.observaciones ?? "");
      const its = (n.items ?? []) as unknown as Array<{ producto_id: string; producto_nombre: string; producto_sku: string; cantidad: number }>;
      setLineas(its.map((i) => ({ producto_id: i.producto_id, nombre: i.producto_nombre, sku: i.producto_sku, cantidad: i.cantidad })));
      setCargando(false);
    })();
    fetch("/api/clientes", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.success || !Array.isArray(j.data)) return;
        const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");
        setClientes((j.data as Record<string, unknown>[]).map((c) => ({
          id: String(c.id),
          label: t(c.empresa) || t(c.nombre_contacto) || t(c.nombre) || "Cliente",
          direccion: t(c.direccion),
          ciudad: t(c.ciudad),
        })));
      })
      .catch(() => undefined);
  }, [id]);

  useEffect(() => {
    if (!origen) return;
    fetchStockDeposito(origen, { soloConStock: false }).then((r) => { if (r.ok) setStock(r.data.items); });
  }, [origen]);

  async function guardar() {
    setError(null);
    setEnviando(true);
    const res = await fetch(`/api/notas-remision/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha: fecha !== fechaOrig ? fecha : undefined,
        emisor,
        ubicacion_origen_id: origen,
        ubicacion_destino_id: destinoTipo === "deposito" ? destino : "",
        destino_tipo: destinoTipo,
        cliente_id: clienteId,
        destino_nombre: destNombre,
        destino_direccion: destDireccion,
        destino_ciudad: destCiudad,
        motivo,
        transportista, ruc_transportista: rucTransp, conductor, ci_conductor: ciConductor,
        chapa, marca_vehiculo: marca,
        documento_origen: docOrigen,
        fecha_inicio_traslado: fechaInicio,
        fecha_fin_traslado: fechaFin,
        observaciones: obs,
        items: lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad })),
      }),
    });
    const j = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok || !j?.success) { setError(j?.error ?? `Error ${res.status}`); return; }
    router.push("/notas-remision");
  }

  if (loaded && !isAdmin) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Solo un administrador puede editar notas de remisión.</div>;
  }
  if (cargando) return <p className="text-sm text-slate-400">Cargando…</p>;

  const q = busqueda.trim().toLowerCase();
  const disponibles = q
    ? stock.filter((p) => !lineas.some((l) => l.producto_id === p.producto_id))
        .filter((p) => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 8)
    : [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-6 shadow-sm">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900">
          <Truck className="h-5 w-5 text-slate-700" /> Editar Nota de Remisión {numero}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          El número y el timbrado{timbrado ? ` (${timbrado})` : ""} se mantienen.
          {estado === "aprobada" && " Como la nota ya está aprobada, si cambiás los ítems se ajusta el stock."}
        </p>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="zx-surface p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">Datos generales</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <F label="Fecha"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inp} /></F>
          <F label="Depósito Origen">
            <select value={origen} onChange={(e) => setOrigen(e.target.value)} className={inp}>
              {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </F>
          <F label="Enviar a">
            <select value={destinoTipo} onChange={(e) => setDestinoTipo(e.target.value as "deposito" | "cliente")} className={inp}>
              <option value="deposito">Otro depósito</option>
              <option value="cliente">Cliente / dirección</option>
            </select>
          </F>
          {destinoTipo === "deposito" ? (
            <F label="Depósito Destino">
              <select value={destino} onChange={(e) => setDestino(e.target.value)} className={inp}>
                <option value="">— Elegí —</option>
                {depositos.filter((d) => d.id !== origen).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </F>
          ) : (
            <F label="Destinatario">
              <select
                value={clienteId}
                onChange={(e) => {
                  setClienteId(e.target.value);
                  const c = clientes.find((x) => x.id === e.target.value);
                  if (c) { setDestNombre(c.label); if (c.direccion) setDestDireccion(c.direccion); if (c.ciudad) setDestCiudad(c.ciudad); }
                }}
                className={inp}
              >
                <option value="">— Elegí un cliente —</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </F>
          )}
          <F label="Motivo">
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inp}>
              <option value="traslado">Traslado</option>
              <option value="venta">Venta</option>
              <option value="devolucion">Devolución</option>
            </select>
          </F>
          <F label="Emisor"><input type="text" value={emisor} onChange={(e) => setEmisor(e.target.value)} className={inp} /></F>
          <F label="Documento de origen"><input type="text" value={docOrigen} onChange={(e) => setDocOrigen(e.target.value)} className={inp} /></F>
        </div>
        {destinoTipo === "cliente" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <F label="Nombre del destinatario"><input type="text" value={destNombre} onChange={(e) => setDestNombre(e.target.value)} className={inp} /></F>
            <F label="Dirección de entrega"><input type="text" value={destDireccion} onChange={(e) => setDestDireccion(e.target.value)} className={inp} /></F>
            <F label="Ciudad / zona"><input type="text" value={destCiudad} onChange={(e) => setDestCiudad(e.target.value)} className={inp} /></F>
          </div>
        )}
      </div>

      <div className="zx-surface p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">Transporte</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <F label="Transportista"><input type="text" value={transportista} onChange={(e) => setTransportista(e.target.value)} className={inp} /></F>
          <F label="RUC transportista"><input type="text" value={rucTransp} onChange={(e) => setRucTransp(e.target.value)} className={inp} /></F>
          <F label="Conductor"><input type="text" value={conductor} onChange={(e) => setConductor(e.target.value)} className={inp} /></F>
          <F label="CI conductor"><input type="text" value={ciConductor} onChange={(e) => setCiConductor(e.target.value)} className={inp} /></F>
          <F label="Marca del vehículo"><input type="text" value={marca} onChange={(e) => setMarca(e.target.value)} className={inp} /></F>
          <F label="Chapa vehículo"><input type="text" value={chapa} onChange={(e) => setChapa(e.target.value)} className={inp} /></F>
          <F label="Inicio traslado"><input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={inp} /></F>
          <F label="Fin traslado"><input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className={inp} /></F>
        </div>
      </div>

      <div className="zx-surface">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Productos</h2>
          <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto por nombre o SKU…" className={inp} />
          {disponibles.length > 0 && (
            <div className="zx-surface mt-1 max-h-64 overflow-y-auto rounded-md shadow-lg">
              {disponibles.map((p) => (
                <button
                  key={p.producto_id}
                  type="button"
                  onClick={() => { setLineas([...lineas, { producto_id: p.producto_id, nombre: p.nombre, sku: p.sku, cantidad: 1 }]); setBusqueda(""); }}
                  className="w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-emerald-50"
                >
                  <span className="font-semibold text-slate-800">{p.nombre}</span>
                  {p.sku && <span className="ml-2 font-mono text-[11px] text-slate-500">{p.sku}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="zx-thead text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Producto</th>
              <th className="w-40 px-5 py-3 text-right">Cantidad</th>
              <th className="w-14 px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.producto_id} className="border-b border-slate-100 last:border-0">
                <td className="px-5 py-3 font-semibold text-slate-700">
                  {l.nombre}{l.sku && <span className="ml-2 font-mono text-[10px] font-normal text-slate-500">{l.sku}</span>}
                </td>
                <td className="px-5 py-3">
                  <input
                    type="number" min={0} value={l.cantidad === 0 ? "" : l.cantidad}
                    onChange={(e) => setLineas(lineas.map((x) => x.producto_id === l.producto_id ? { ...x, cantidad: Number(e.target.value) || 0 } : x))}
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                  />
                </td>
                <td className="px-5 py-3 text-right">
                  <button type="button" title="Quitar" onClick={() => setLineas(lineas.filter((x) => x.producto_id !== l.producto_id))} className="h-8 w-8 rounded-md text-rose-600 hover:bg-rose-50">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="zx-surface p-6">
        <label className="text-xs font-medium text-slate-600">Observaciones</label>
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex justify-end gap-2">
        <Link href="/notas-remision" className="zx-surface rounded-md px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</Link>
        <button type="button" onClick={guardar} disabled={enviando} className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60">
          <Save className="h-4 w-4" /> {enviando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
