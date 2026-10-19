import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export type ReciboOrigen = "venta_contado" | "cobro_cxc" | "manual";

export type Recibo = {
  id: string;
  numero_recibo: string;
  cliente_id: string | null;
  cliente_nombre: string;
  cliente_documento: string | null;
  origen: ReciboOrigen;
  venta_id: string | null;
  fecha: string;
  moneda: string;
  monto: number;
  metodo_pago: string | null;
  referencia: string | null;
  concepto: string | null;
  observaciones: string | null;
  usuario_nombre: string | null;
  anulado: boolean;
  // Depósito a banco (solo Living Room)
  deposito_entidad_bancaria_id?: string | null;
  deposito_fecha?: string | null;
  deposito_banco_movimiento_id?: string | null;
};

export type BancoOpcion = { id: string; nombre: string; moneda: string };

export type ReciboManualInput = {
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  monto: number;
  moneda?: string;
  metodo_pago?: string;
  referencia?: string;
  concepto?: string;
};

type GenerarReciboInput =
  | { origen: "venta_contado"; venta_id: string }
  | { origen: "cobro_cxc"; cobro_cliente_id: string }
  | { origen: "manual"; manual: ReciboManualInput };

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function unwrap<T>(res: Response): Promise<Result<T>> {
  try {
    const j = await res.json();
    if (!res.ok || j?.success === false) {
      return { ok: false, error: j?.error ?? `Error ${res.status}` };
    }
    return { ok: true, data: j.data as T };
  } catch {
    return { ok: false, error: "Error de red." };
  }
}

/** Lista recibos con filtros. */
export async function fetchRecibos(filtros?: {
  desde?: string;
  hasta?: string;
  origen?: ReciboOrigen | "";
  buscar?: string;
  incluirAnulados?: boolean;
}): Promise<Result<{ recibos: Recibo[] }>> {
  const p = new URLSearchParams();
  if (filtros?.desde) p.set("desde", filtros.desde);
  if (filtros?.hasta) p.set("hasta", filtros.hasta);
  if (filtros?.origen) p.set("origen", filtros.origen);
  if (filtros?.buscar) p.set("buscar", filtros.buscar);
  if (filtros?.incluirAnulados) p.set("incluir_anulados", "1");
  const qs = p.toString();
  return unwrap(
    await fetchWithSupabaseSession(`/api/recibos-dinero${qs ? `?${qs}` : ""}`, { cache: "no-store" })
  );
}

/** Emite un recibo manual (no atado a venta ni cobro). */
export async function crearReciboManual(manual: ReciboManualInput): Promise<Result<{ recibo: Recibo }>> {
  return unwrap(
    await fetchWithSupabaseSession("/api/recibos-dinero", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origen: "manual", manual }),
    })
  );
}

/** Anula un recibo. No revierte la venta ni el cobro asociado. */
export async function anularRecibo(id: string, motivo?: string): Promise<Result<{ recibo: Recibo }>> {
  return unwrap(
    await fetchWithSupabaseSession(`/api/recibos-dinero/${id}/anular`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo: motivo ?? "" }),
    })
  );
}

/** Abre el PDF imprimible de un recibo. */
export function abrirReciboPdf(id: string): void {
  try {
    window.open(`/api/recibos-dinero/${id}/pdf?auto=1`, "_blank", "noopener");
  } catch { /* el popup pudo bloquearse */ }
}

/**
 * Genera (o reutiliza si ya existe) un recibo de dinero y abre su documento imprimible.
 * Idempotente: si ya hay recibo para esa venta/cobro, se reimprime el mismo.
 * Devuelve true si se abrió OK, o un mensaje de error.
 */
export async function generarYAbrirRecibo(input: GenerarReciboInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchWithSupabaseSession("/api/recibos-dinero", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await res.json();
    if (!res.ok || body?.success === false || !body?.data?.recibo?.id) {
      return { ok: false, error: body?.error ?? "No se pudo generar el recibo." };
    }
    const id = String(body.data.recibo.id);
    try {
      window.open(`/api/recibos-dinero/${id}/pdf?auto=1`, "_blank", "noopener");
    } catch { /* el popup pudo bloquearse */ }
    return { ok: true };
  } catch {
    return { ok: false, error: "Error de red al generar el recibo." };
  }
}

/** Corrige un recibo (solo admin). Monto y moneda solo aplican a los manuales. */
export async function editarRecibo(
  id: string,
  datos: Partial<Pick<Recibo, "cliente_nombre" | "cliente_documento" | "concepto" | "referencia" | "observaciones" | "metodo_pago" | "monto" | "moneda">>
): Promise<Result<{ id: string }>> {
  return unwrap(
    await fetchWithSupabaseSession(`/api/recibos-dinero/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    })
  );
}

/** Borra un recibo hecho por error (solo admin). No toca la venta ni el cobro. */
export async function borrarRecibo(id: string): Promise<Result<{ id: string }>> {
  return unwrap(await fetchWithSupabaseSession(`/api/recibos-dinero/${id}`, { method: "DELETE" }));
}

/** Bancos activos del tenant (para el depósito del recibo). Living Room. */
export async function fetchBancos(): Promise<Result<BancoOpcion[]>> {
  try {
    const res = await fetchWithSupabaseSession("/api/tesoreria", { cache: "no-store" });
    const j = await res.json();
    if (!res.ok || j?.success === false) return { ok: false, error: j?.error ?? `Error ${res.status}` };
    const bancos = ((j?.data?.bancos ?? []) as Array<Record<string, unknown>>).map((b) => ({
      id: String(b.id),
      nombre: String(b.nombre ?? ""),
      moneda: String(b.moneda ?? "PYG"),
    }));
    return { ok: true, data: bancos };
  } catch {
    return { ok: false, error: "Error de red." };
  }
}

/**
 * Registra el depósito a banco de un recibo (Living Room): elige el banco, la
 * fecha y opcionalmente adjunta una foto del comprobante. Crea el ingreso en el
 * banco para que figure ahí.
 */
export async function registrarDeposito(
  id: string,
  datos: { entidad_bancaria_id: string; fecha?: string; file?: File | null }
): Promise<Result<{ ok: true; foto_url: string | null }>> {
  const fd = new FormData();
  fd.set("entidad_bancaria_id", datos.entidad_bancaria_id);
  if (datos.fecha) fd.set("fecha", datos.fecha);
  if (datos.file) fd.set("file", datos.file);
  return unwrap(
    await fetchWithSupabaseSession(`/api/recibos-dinero/${id}/deposito`, { method: "POST", body: fd })
  );
}

/** URL para ver la foto del depósito de un recibo. */
export function urlFotoDeposito(id: string): string {
  return `/api/recibos-dinero/${id}/deposito?foto=1`;
}
