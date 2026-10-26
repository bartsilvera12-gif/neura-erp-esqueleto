"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createGasto, updateGasto } from "@/lib/gastos/actions";
import MontoInput from "@/components/ui/MontoInput";
import type { Gasto, GastoInput } from "@/lib/gastos/actions";
import { Select } from "@/components/ui/Select";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { ClipboardList } from "lucide-react";
import { esInstanciaLR } from "@/lib/inventario/campos-lr";
import SelectFromList from "@/components/inventario/SelectFromList";
import { GASTOS_RUTA, SECCION_DEFECTO, type Seccion } from "@/lib/secciones";

type OrigenCuenta = { id: string; nombre: string };
type CuentaPlan = { id: string; cuenta: string; denominacion: string; asentable?: boolean | null; activo?: boolean | null };

const fLabel = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1";
const fInput =
  "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] bg-white";

type Props = {
  gasto?: Gasto | null;
  onSuccess?: () => void;
  /** Sección del gasto nuevo (Showroom por defecto). En edición se mantiene la del gasto. */
  seccion?: Seccion;
};

export default function GastoForm({ gasto, onSuccess, seccion = SECCION_DEFECTO }: Props) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A qué listado volver al guardar/cancelar (según la sección).
  const rutaVolver = GASTOS_RUTA[gasto?.seccion ?? seccion];

  const usaLR = esInstanciaLR();
  const [form, setForm] = useState<GastoInput>({
    categoria: gasto?.categoria ?? "",
    descripcion: gasto?.descripcion ?? "",
    monto: gasto?.monto ?? 0,
    tipo: gasto?.tipo ?? "variable",
    recurrente: gasto?.recurrente ?? false,
    frecuencia: gasto?.frecuencia ?? "",
    fecha: gasto?.fecha ?? new Date().toISOString().slice(0, 10),
    proyecto_id: gasto?.proyecto_id ?? null,
    facturado: gasto?.facturado ?? false,
    cuenta_contable_id: gasto?.cuenta_contable_id ?? null,
    proveedor_nombre: gasto?.proveedor_nombre ?? "",
    proveedor_documento: gasto?.proveedor_documento ?? "",
    origen_medio: gasto?.entidad_bancaria_id ? "BANCO" : gasto?.caja_chica_id ? "CAJA_CHICA" : null,
    origen_cuenta_id: gasto?.entidad_bancaria_id ?? gasto?.caja_chica_id ?? null,
  });

  const [proyectos, setProyectos] = useState<{ id: string; titulo: string }[]>([]);
  const [bancos, setBancos] = useState<OrigenCuenta[]>([]);
  const [cajas, setCajas] = useState<OrigenCuenta[]>([]);
  const [cuentas, setCuentas] = useState<CuentaPlan[]>([]);

  // Living Room: bancos, cajas chicas y plan de cuentas para los campos nuevos.
  useEffect(() => {
    if (!usaLR) return;
    fetchWithSupabaseSession("/api/tesoreria", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        setBancos(((j?.data?.bancos ?? []) as OrigenCuenta[]).map((b) => ({ id: b.id, nombre: b.nombre })));
        setCajas(((j?.data?.cajas ?? []) as OrigenCuenta[]).map((k) => ({ id: k.id, nombre: k.nombre })));
      })
      .catch(() => {});
    fetchWithSupabaseSession("/api/configuracion/plan-cuentas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setCuentas(((j?.data?.cuentas ?? []) as CuentaPlan[]).filter((c) => c.activo !== false && c.asentable !== false)))
      .catch(() => {});
  }, [usaLR]);

  useEffect(() => {
    fetchWithSupabaseSession("/api/proyectos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Error ${r.status}`))))
      .then((j) => {
        const arr = Array.isArray(j?.data?.proyectos) ? j.data.proyectos : (j?.data ?? []);
        setProyectos(
          (arr as Array<Record<string, unknown>>).map((p) => ({
            id: String(p.id),
            titulo: String(p.titulo ?? p.nombre ?? "(sin título)"),
          })),
        );
      })
      .catch(() => setProyectos([]));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, recurrente: (e.target as HTMLInputElement).checked }));
    } else if (name !== "monto") {
      const normalized = ["categoria", "descripcion", "frecuencia", "proveedor_nombre"].includes(name) ? value.toUpperCase() : value;
      setForm((prev) => ({ ...prev, [name]: normalized }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.monto <= 0) {
      return setError("El monto debe ser mayor a 0.");
    }

    // Living Room: al crear, "de dónde salió" es obligatorio (banco o caja chica).
    if (usaLR && !gasto && (!form.origen_medio || !form.origen_cuenta_id)) {
      return setError("Elegí de dónde salió el gasto: un banco o una caja chica.");
    }

    setGuardando(true);

    try {
      if (gasto) {
        await updateGasto(gasto.id, form);
      } else {
        await createGasto({ ...form, seccion });
      }
      onSuccess?.();
      router.push(rutaVolver);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="zx-surface p-6">
        <div className="flex items-center gap-2 mb-5 pb-2 border-b border-slate-200">
          <ClipboardList className="h-4 w-4 text-[#3F8E91]" aria-hidden />
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
            Datos del gasto
          </h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className={fLabel}>Categoría</label>
            <input
              type="text"
              name="categoria"
              value={form.categoria}
              onChange={handleChange}
              placeholder="Ej: Servicios, Alquiler, Salarios"
              className={fInput}
            />
          </div>
          <div>
            <label className={fLabel}>Descripción</label>
            <textarea
              name="descripcion"
              value={form.descripcion}
              onChange={handleChange}
              placeholder="Descripción del gasto"
              className={fInput}
              rows={2}
            />
          </div>
          <div>
            <label className={fLabel}>Monto (Gs.) *</label>
            <MontoInput
              value={form.monto}
              onChange={(n) => setForm((prev) => ({ ...prev, monto: n }))}
              placeholder="0"
              className={fInput}
              required
            />
          </div>
          <div>
            <label className={fLabel}>Tipo</label>
            <Select
              name="tipo"
              value={form.tipo}
              onChange={handleChange}
              className={fInput}
            >
              <option value="variable">Variable</option>
              <option value="fijo">Fijo</option>
            </Select>
          </div>

          {usaLR && (
            <>
              {/* Gasto sin factura: genera un Recibo de Gasto (el gasto con factura va por el Libro de compras). */}
              <div className="rounded-lg border border-[#4FAEB2]/30 bg-[#4FAEB2]/5 px-3 py-2">
                <p className="text-xs font-semibold text-[#3F8E91]">Gasto sin factura</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Vas a poder imprimir un &quot;Recibo de Gasto&quot; desde el listado. Si el gasto tiene factura, cargalo con el botón &quot;Gasto con factura&quot;.
                </p>
              </div>

              {/* Proveedor o persona + RUC/CI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={fLabel}>Proveedor o persona</label>
                  <input
                    type="text"
                    name="proveedor_nombre"
                    value={form.proveedor_nombre ?? ""}
                    onChange={handleChange}
                    placeholder="A quién se le pagó"
                    className={fInput}
                  />
                </div>
                <div>
                  <label className={fLabel}>RUC o CI</label>
                  <input
                    type="text"
                    name="proveedor_documento"
                    value={form.proveedor_documento ?? ""}
                    onChange={handleChange}
                    placeholder="N° de RUC o cédula"
                    className={fInput}
                  />
                </div>
              </div>

              {/* Cuenta contable */}
              <div>
                <label className={fLabel}>Cuenta contable</label>
                <SelectFromList
                  buscable
                  value={form.cuenta_contable_id ?? null}
                  onChange={(v) => setForm((prev) => ({ ...prev, cuenta_contable_id: v }))}
                  placeholder="Buscar cuenta por código o nombre…"
                  emptyShort="Sin plan de cuentas"
                  options={cuentas.map((c) => ({ id: c.id, label: c.denominacion, sublabel: c.cuenta }))}
                />
              </div>

              {/* Origen del dinero: banco o caja chica (baja el saldo). Obligatorio. */}
              <div>
                <label className={fLabel}>¿De dónde salió? *</label>
                <Select
                  value={form.origen_medio ?? ""}
                  onChange={(e) => {
                    const medio = (e.target.value || null) as "BANCO" | "CAJA_CHICA" | null;
                    setForm((prev) => ({ ...prev, origen_medio: medio, origen_cuenta_id: null }));
                  }}
                  className={fInput}
                >
                  <option value="">— Elegí banco o caja chica —</option>
                  <option value="BANCO">Banco</option>
                  <option value="CAJA_CHICA">Caja chica</option>
                </Select>
                {form.origen_medio && (
                  <div className="mt-2">
                    <Select
                      value={form.origen_cuenta_id ?? ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, origen_cuenta_id: e.target.value || null }))}
                      className={fInput}
                    >
                      <option value="">{form.origen_medio === "BANCO" ? "Elegí el banco…" : "Elegí la caja chica…"}</option>
                      {(form.origen_medio === "BANCO" ? bancos : cajas).map((o) => (
                        <option key={o.id} value={o.id}>{o.nombre}</option>
                      ))}
                    </Select>
                    <p className="mt-1 text-xs text-slate-500">Se descuenta del saldo de ese {form.origen_medio === "BANCO" ? "banco" : "caja chica"}.</p>
                  </div>
                )}
              </div>
            </>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="recurrente"
              name="recurrente"
              checked={form.recurrente}
              onChange={handleChange}
              className="rounded border-slate-300 text-[#0EA5E9] focus:ring-[#0EA5E9]"
            />
            <label htmlFor="recurrente" className="text-sm text-slate-700">
              Gasto recurrente
            </label>
          </div>
          {form.recurrente && (
            <div>
              <label className={fLabel}>Frecuencia</label>
              <input
                type="text"
                name="frecuencia"
                value={form.frecuencia ?? ""}
                onChange={handleChange}
                placeholder="Ej: Mensual, Semanal"
                className={fInput}
              />
            </div>
          )}
          <div>
            <label className={fLabel}>Fecha *</label>
            <input
              type="date"
              name="fecha"
              value={form.fecha}
              onChange={handleChange}
              className={fInput}
              required
            />
          </div>
          <div>
            <label className={fLabel}>Proyecto (opcional)</label>
            <Select
              name="proyecto_id"
              value={form.proyecto_id ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, proyecto_id: e.target.value || null }))}
              className={fInput}
            >
              <option value="">— Sin proyecto —</option>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-500">
              Cuando el gasto excede la caja chica, imputalo a un proyecto para verlo en Fondos por proyecto.
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          type="submit"
          disabled={guardando}
          className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {guardando ? "Guardando…" : gasto ? "Guardar cambios" : "Crear gasto"}
        </button>
        <button
          type="button"
          onClick={() => router.push(rutaVolver)}
          className="border border-slate-200 text-sm px-6 py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
