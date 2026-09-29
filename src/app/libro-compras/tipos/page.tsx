"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import { Aviso, ModalShell, api, btnPrimario, btnSecundario, inputClass, jsonInit, labelClass } from "@/components/comex/ui";
import type { ConfigCompras, TipoComprobante } from "../_components/FormCompra";

/** Tipos de comprobante de compra y cuentas del pre-asiento. */
export default function TiposComprobantePage() {
  const { isAdmin } = useIsAdmin();
  const [tipos, setTipos] = useState<TipoComprobante[]>([]);
  const [config, setConfig] = useState<ConfigCompras | null>(null);
  const [editando, setEditando] = useState<TipoComprobante | "nuevo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const d = await api<{ tipos: TipoComprobante[]; config: ConfigCompras }>("/api/libro-compras/config");
      setTipos(d.tipos);
      setConfig(d.config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardarConfig() {
    if (!config) return;
    setError(null);
    setAviso(null);
    try {
      await api("/api/libro-compras/config", jsonInit("PATCH", config));
      setAviso("Cuentas guardadas.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  const compras = tipos.filter((t) => t.uso === "COMPRA");
  const set = (k: keyof ConfigCompras, v: string) => config && setConfig({ ...config, [k]: v });

  return (
    <div className="space-y-6">
      <Link href="/libro-compras" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Libro de compras
      </Link>
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Compras</p>
        <h1 className="text-2xl font-semibold text-slate-900">Tipos de comprobante y cuentas</h1>
        <p className="text-sm text-slate-600">La cuenta de cada tipo es la que va al haber del pre-asiento cuando la compra es al contado.</p>
      </header>
      {error && <Aviso>{error}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Tipos de comprobante de compra</h2>
          {isAdmin && (
            <button onClick={() => setEditando("nuevo")} className={btnPrimario}>
              <Plus className="h-3.5 w-3.5" /> Nuevo tipo
            </button>
          )}
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Condición</th>
                <th className="px-4 py-3">Cuenta</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {compras.map((t) => (
                <tr key={t.id} className={`border-t border-slate-100 ${t.activo ? "" : "text-slate-400"}`}>
                  <td className="px-4 py-2.5">{t.codigo}</td>
                  <td className="px-4 py-2.5">
                    {t.nombre}
                    {t.es_nota_credito && <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">NOTA DE CRÉDITO</span>}
                  </td>
                  <td className="px-4 py-2.5">{t.condicion === "CREDITO" ? "Crédito" : "Contado"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{t.cuenta_codigo ?? (t.condicion === "CREDITO" ? "(proveedores)" : <span className="text-rose-600">Falta</span>)}</td>
                  <td className="px-4 py-2.5">{t.activo ? "Activo" : "Inactivo"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {isAdmin && (
                      <button onClick={() => setEditando(t)} className="text-xs font-medium text-sky-700 hover:underline">
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">Los tipos de venta (venta contado, venta crédito, exportación) no aparecen acá porque no son compras.</p>
      </section>

      {config && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Cuentas del pre-asiento</h2>
          <fieldset disabled={!isAdmin} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelClass}>IVA crédito fiscal</label>
              <input value={config.cuenta_iva_credito} onChange={(e) => set("cuenta_iva_credito", e.target.value)} className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className={labelClass}>Proveedores (compras a crédito)</label>
              <input value={config.cuenta_proveedores} onChange={(e) => set("cuenta_proveedores", e.target.value)} className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className={labelClass}>Retención de IVA</label>
              <input value={config.cuenta_retencion_iva ?? ""} onChange={(e) => set("cuenta_retencion_iva", e.target.value)} placeholder="Sin definir" className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className={labelClass}>Retención de renta</label>
              <input value={config.cuenta_retencion_renta ?? ""} onChange={(e) => set("cuenta_retencion_renta", e.target.value)} placeholder="Sin definir" className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className={labelClass}>Centro de costo por defecto</label>
              <input value={config.centro_costo_defecto} onChange={(e) => set("centro_costo_defecto", e.target.value)} className={`${inputClass} font-mono`} />
            </div>
            <div>
              <label className={labelClass}>Programa por defecto</label>
              <input value={config.programa_defecto} onChange={(e) => set("programa_defecto", e.target.value)} className={`${inputClass} font-mono`} />
            </div>
          </fieldset>
          {isAdmin && (
            <button onClick={() => void guardarConfig()} className={btnPrimario}>
              Guardar cuentas
            </button>
          )}
        </section>
      )}

      {editando && (
        <ModalTipo
          tipo={editando === "nuevo" ? null : editando}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function ModalTipo({ tipo, onClose, onSaved }: { tipo: TipoComprobante | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    codigo: tipo ? String(tipo.codigo) : "",
    nombre: tipo?.nombre ?? "",
    condicion: tipo?.condicion ?? "CONTADO",
    cuenta_codigo: tipo?.cuenta_codigo ?? "",
    es_nota_credito: tipo?.es_nota_credito ?? false,
    activo: tipo?.activo ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function guardar() {
    setSaving(true);
    setError(null);
    try {
      if (tipo) await api(`/api/libro-compras/tipos/${tipo.id}`, jsonInit("PATCH", f));
      else await api("/api/libro-compras/tipos", jsonInit("POST", { ...f, codigo: Number(f.codigo) }));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  }
  return (
    <ModalShell title={tipo ? `Editar ${tipo.nombre}` : "Nuevo tipo de comprobante"} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Código</label>
            <input value={f.codigo} disabled={!!tipo} onChange={(e) => setF({ ...f, codigo: e.target.value.replace(/\D/g, "") })} className={inputClass} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Nombre</label>
            <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value.toUpperCase() })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Condición</label>
            <select value={f.condicion} onChange={(e) => setF({ ...f, condicion: e.target.value as "CONTADO" | "CREDITO" })} className={inputClass}>
              <option value="CONTADO">Contado</option>
              <option value="CREDITO">Crédito</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Cuenta (haber al contado)</label>
            <input value={f.cuenta_codigo} onChange={(e) => setF({ ...f, cuenta_codigo: e.target.value })} placeholder="1.01.01.02.000" className={`${inputClass} font-mono`} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.es_nota_credito} onChange={(e) => setF({ ...f, es_nota_credito: e.target.checked })} /> Es nota de crédito (el asiento va al revés)
        </label>
        {tipo && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activo
          </label>
        )}
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnSecundario}>
            Cancelar
          </button>
          <button onClick={() => void guardar()} disabled={saving} className={btnPrimario}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
