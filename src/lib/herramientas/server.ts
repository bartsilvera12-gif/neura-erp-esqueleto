import "server-only";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const ESTADOS_HERRAMIENTA = ["FUNCIONANDO", "AVERIADA", "EN_REPARACION", "DADA_DE_BAJA"] as const;
export type EstadoHerramienta = (typeof ESTADOS_HERRAMIENTA)[number];

export const ESTADO_LABEL: Record<EstadoHerramienta, string> = {
  FUNCIONANDO: "Funcionando",
  AVERIADA: "Averiada",
  EN_REPARACION: "En reparación",
  DADA_DE_BAJA: "Dada de baja",
};

export const HERRAMIENTA_COLS =
  "id, nombre, categoria, marca, modelo, numero_serie, ubicacion, responsable, estado, " +
  "fecha_adquisicion, costo, observaciones, created_at, updated_at";

export interface HerramientaInput {
  nombre: string;
  categoria?: string | null;
  marca?: string | null;
  modelo?: string | null;
  numero_serie?: string | null;
  ubicacion?: string | null;
  responsable?: string | null;
  estado?: EstadoHerramienta;
  fecha_adquisicion?: string | null;
  costo?: number | null;
  observaciones?: string | null;
}

function txt(v: unknown, max = 200): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}
function up(v: unknown, max = 200): string | null {
  const s = txt(v, max);
  return s ? s.toUpperCase() : null;
}

export function normalizarInput(b: Record<string, unknown>): HerramientaInput & { nombre: string } {
  const nombre = up(b.nombre);
  if (!nombre) throw new Error("El nombre de la herramienta es obligatorio.");
  const estadoRaw = String(b.estado ?? "FUNCIONANDO").toUpperCase();
  const estado = (ESTADOS_HERRAMIENTA as readonly string[]).includes(estadoRaw)
    ? (estadoRaw as EstadoHerramienta)
    : "FUNCIONANDO";
  const costo = b.costo != null && b.costo !== "" ? Number(b.costo) : null;
  const fecha = String(b.fecha_adquisicion ?? "").trim();
  const fecha_adquisicion = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;
  return {
    nombre,
    categoria: up(b.categoria, 100),
    marca: up(b.marca, 100),
    modelo: up(b.modelo, 100),
    numero_serie: up(b.numero_serie, 100),
    ubicacion: up(b.ubicacion, 150),
    responsable: up(b.responsable, 150),
    estado,
    fecha_adquisicion,
    costo: Number.isFinite(costo as number) ? (costo as number) : null,
    observaciones: txt(b.observaciones, 2000),
  };
}

export async function listarHerramientas(sb: AppSupabaseClient, empresaId: string, opts: { estado?: string | null; buscar?: string | null } = {}) {
  let q = sb.from("herramientas").select(HERRAMIENTA_COLS).eq("empresa_id", empresaId).order("nombre");
  if (opts.estado && (ESTADOS_HERRAMIENTA as readonly string[]).includes(opts.estado)) q = q.eq("estado", opts.estado);
  if (opts.buscar && opts.buscar.trim().length > 0) {
    const s = opts.buscar.trim();
    q = q.or(`nombre.ilike.%${s}%,marca.ilike.%${s}%,modelo.ilike.%${s}%,numero_serie.ilike.%${s}%,ubicacion.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}
