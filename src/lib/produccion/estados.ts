/** Ciclo de vida del proyecto de producción (especificación, sección 4). */
export const ESTADOS_PROYECTO = [
  "borrador",
  "presupuestado",
  "aprobado",
  "en_produccion",
  "en_revision",
  "entregado",
  "cerrado",
] as const;
export type EstadoProyecto = (typeof ESTADOS_PROYECTO)[number] | "cancelado";

export const ESTADO_PROYECTO_LABEL: Record<string, string> = {
  borrador: "Borrador",
  presupuestado: "Presupuestado",
  aprobado: "Aprobado",
  en_produccion: "En producción",
  en_revision: "En revisión",
  entregado: "Entregado",
  cerrado: "Cerrado",
  cancelado: "Cancelado",
};

/** Transición válida: avanzar/retroceder un paso en el flujo, o cancelar (salvo cerrado). */
export function transicionProyectoValida(desde: string, hacia: string): boolean {
  if (desde === hacia) return false;
  if (desde === "cerrado") return false; // reapertura es un flujo aparte (Fase 6)
  if (hacia === "cancelado") return desde !== "cancelado";
  if (desde === "cancelado") return hacia === "borrador"; // reactivar
  const i = ESTADOS_PROYECTO.indexOf(desde as (typeof ESTADOS_PROYECTO)[number]);
  const j = ESTADOS_PROYECTO.indexOf(hacia as (typeof ESTADOS_PROYECTO)[number]);
  if (i < 0 || j < 0) return false;
  return j === i + 1 || j === i - 1;
}
