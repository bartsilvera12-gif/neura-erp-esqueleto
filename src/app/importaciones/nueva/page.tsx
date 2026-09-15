"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

type Ubicacion = { id: string; nombre: string; pais: string | null };

export default function NuevaImportacionPage() {
  const router = useRouter();
  const [proveedor, setProveedor] = useState("");
  const [pais, setPais] = useState("BOL");
  const [incoterm, setIncoterm] = useState("");
  const [moneda, setMoneda] = useState<"USD" | "BOB" | "PYG">("USD");
  const [monto, setMonto] = useState("");
  const [tipoCambio, setTipoCambio] = useState("");
  const [fechaPedido, setFechaPedido] = useState(new Date().toISOString().slice(0, 10));
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [ubicExt, setUbicExt] = useState("");
  const [ubicPy, setUbicPy] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithSupabaseSession("/api/inventario/ubicaciones?todas=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setUbicaciones((j.data?.ubicaciones ?? []) as Ubicacion[]))
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/importaciones", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proveedor_nombre: proveedor.trim() || null,
          pais_origen: pais,
          incoterm: incoterm.trim() || null,
          moneda,
          monto_estimado: Number(monto) || 0,
          tipo_cambio: Number(tipoCambio) || 1,
          fecha_pedido: fechaPedido || null,
          ubicacion_exterior_id: ubicExt || null,
          ubicacion_destino_py_id: ubicPy || null,
          observaciones: obs.trim() || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `Error ${r.status}`);
      router.push(`/importaciones/${j.data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setSaving(false);
    }
  }

  const ubicPY = ubicaciones.filter((u) => (u.pais ?? "PY") === "PY");
  const ubicExtOptions = ubicaciones.filter((u) => u.pais === "EXTERIOR" || u.pais === "BOL");

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/importaciones"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Importaciones
      </Link>
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Zentra · Operaciones
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">Nueva importación</h1>
        <p className="text-sm text-slate-600">Datos del expediente. Los ítems y la caja se cargan luego.</p>
      </header>
      <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Proveedor</label>
            <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>País origen</label>
            <input value={pais} onChange={(e) => setPais(e.target.value.toUpperCase())} className={inputClass} placeholder="BOL, CHN, USA…" />
          </div>
          <div>
            <label className={labelClass}>Incoterm</label>
            <input value={incoterm} onChange={(e) => setIncoterm(e.target.value.toUpperCase())} className={inputClass} placeholder="FOB, CIF, EXW…" />
          </div>
          <div>
            <label className={labelClass}>Moneda</label>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value as "USD" | "BOB" | "PYG")} className={inputClass}>
              <option value="USD">USD</option>
              <option value="BOB">BOB</option>
              <option value="PYG">PYG</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Tipo de cambio (opcional)</label>
            <input type="number" step="any" min={0} value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} className={inputClass} placeholder="1" />
          </div>
          <div>
            <label className={labelClass}>Monto estimado</label>
            <input type="number" step="any" min={0} value={monto} onChange={(e) => setMonto(e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label className={labelClass}>Fecha pedido</label>
            <input type="date" value={fechaPedido} onChange={(e) => setFechaPedido(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Almacén exterior</label>
            <select value={ubicExt} onChange={(e) => setUbicExt(e.target.value)} className={inputClass}>
              <option value="">— Seleccionar —</option>
              {ubicExtOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Almacén Paraguay (destino)</label>
            <select value={ubicPy} onChange={(e) => setUbicPy(e.target.value)} className={inputClass}>
              <option value="">— Seleccionar —</option>
              {ubicPY.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Observaciones</label>
            <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={inputClass} />
          </div>
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Link
            href="/importaciones"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Creando…" : "Crear importación"}
          </button>
        </div>
      </form>
    </div>
  );
}
