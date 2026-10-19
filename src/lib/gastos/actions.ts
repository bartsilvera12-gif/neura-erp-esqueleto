import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { esInstanciaLR } from "@/lib/inventario/campos-lr";
import { ymdInicioFinMesLocal } from "@/lib/fechas/calendario";
import { getBrowserSupabaseForEmpresaData } from "@/lib/supabase/browser-data-client";

export type Gasto = {
  id: string;
  empresa_id: string;
  categoria: string;
  descripcion: string;
  monto: number;
  tipo: "fijo" | "variable";
  recurrente: boolean;
  frecuencia?: string;
  fecha: string;
  proyecto_id?: string | null;
  created_at: string;
  facturado?: boolean;
  cuenta_contable_id?: string | null;
  entidad_bancaria_id?: string | null;
  caja_chica_id?: string | null;
};

export type GastoInput = {
  categoria: string;
  descripcion: string;
  monto: number;
  tipo: "fijo" | "variable";
  recurrente: boolean;
  frecuencia?: string;
  fecha: string;
  proyecto_id?: string | null;
  /** Living Room: sin factura (false) o facturado (true). */
  facturado?: boolean;
  /** Living Room: cuenta contable del gasto. */
  cuenta_contable_id?: string | null;
  /** Living Room: de dónde salió el dinero. */
  origen_medio?: "BANCO" | "CAJA_CHICA" | null;
  origen_cuenta_id?: string | null;
};

function mapRow(r: Record<string, unknown>): Gasto {
  return {
    id: r.id as string,
    empresa_id: r.empresa_id as string,
    categoria: (r.categoria as string) ?? "",
    descripcion: (r.descripcion as string) ?? "",
    monto: Number(r.monto) ?? 0,
    tipo: (r.tipo as "fijo" | "variable") ?? "variable",
    recurrente: Boolean(r.recurrente),
    frecuencia: r.frecuencia as string | undefined,
    fecha: (r.fecha as string) ?? "",
    proyecto_id: (r.proyecto_id as string | null) ?? null,
    created_at: (r.created_at as string) ?? "",
    facturado: r.facturado === undefined ? undefined : Boolean(r.facturado),
    cuenta_contable_id: (r.cuenta_contable_id as string | null) ?? null,
    entidad_bancaria_id: (r.entidad_bancaria_id as string | null) ?? null,
    caja_chica_id: (r.caja_chica_id as string | null) ?? null,
  };
}

/** Obtiene todos los gastos de la empresa, ordenados por fecha desc. */
export async function getGastos(): Promise<Gasto[]> {
  if (typeof window !== "undefined") {
    const res = await fetchWithSupabaseSession("/api/gastos", { cache: "no-store" });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || `Error ${res.status}`);
    }
    const json = (await res.json()) as { success?: boolean; data?: Record<string, unknown>[] };
    if (!json.success || !Array.isArray(json.data)) return [];
    return json.data.map(mapRow);
  }

  const supabase = await getBrowserSupabaseForEmpresaData();
  const { data, error } = await supabase
    .from("gastos")
    .select("*")
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

/** Obtiene los gastos del mes actual (para Dashboard). RLS filtra por empresa. */
export async function getGastosMesActual(): Promise<Gasto[]> {
  const supabase = await getBrowserSupabaseForEmpresaData();
  const hoy = new Date();
  const { inicioYmd: inicioMes, finYmd: finMes } = ymdInicioFinMesLocal(hoy);

  const { data, error } = await supabase
    .from("gastos")
    .select("*")
    .gte("fecha", inicioMes)
    .lte("fecha", finMes)
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export async function createGasto(input: GastoInput): Promise<Gasto> {
  if (input.monto <= 0) throw new Error("El monto debe ser mayor a 0");

  // Se crea por el API (server): valida el origen (banco/caja chica) y registra
  // el egreso que baja el saldo. El insert directo no podía hacer eso.
  const res = await fetchWithSupabaseSession("/api/gastos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      categoria: input.categoria,
      descripcion: input.descripcion,
      monto: input.monto,
      tipo: input.tipo,
      recurrente: input.recurrente,
      frecuencia: input.frecuencia,
      fecha: input.fecha,
      proyecto_id: input.proyecto_id ?? null,
      facturado: input.facturado,
      cuenta_contable_id: input.cuenta_contable_id ?? null,
      origen_medio: input.origen_medio ?? null,
      origen_cuenta_id: input.origen_cuenta_id ?? null,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Record<string, unknown>; error?: string };
  if (!res.ok || !json.success) throw new Error(json.error ?? `Error ${res.status}`);
  return mapRow(json.data ?? {});
}

export async function updateGasto(id: string, input: Partial<GastoInput>): Promise<Gasto> {
  if (input.monto !== undefined && input.monto <= 0) throw new Error("El monto debe ser mayor a 0");

  const supabase = await getBrowserSupabaseForEmpresaData();
  const update: Record<string, unknown> = {};
  if (input.categoria !== undefined) update.categoria = input.categoria.trim() || null;
  if (input.descripcion !== undefined) update.descripcion = input.descripcion.trim() || null;
  if (input.monto !== undefined) update.monto = input.monto;
  if (input.tipo !== undefined) update.tipo = input.tipo;
  if (input.recurrente !== undefined) update.recurrente = input.recurrente;
  if (input.frecuencia !== undefined) update.frecuencia = input.frecuencia?.trim() || null;
  if (input.fecha !== undefined) update.fecha = input.fecha;
  if (input.proyecto_id !== undefined) update.proyecto_id = input.proyecto_id ?? null;
  // Living Room: columnas nuevas (facturado, cuenta contable). El origen (banco/
  // caja) no se reeditar acá: se define al crear el gasto.
  if (esInstanciaLR()) {
    if (input.facturado !== undefined) update.facturado = input.facturado;
    if (input.cuenta_contable_id !== undefined) update.cuenta_contable_id = input.cuenta_contable_id ?? null;
  }

  const { data, error } = await supabase
    .from("gastos")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function deleteGasto(id: string): Promise<void> {
  const supabase = await getBrowserSupabaseForEmpresaData();
  const { error } = await supabase.from("gastos").delete().eq("id", id);

  if (error) throw new Error(error.message);
}
