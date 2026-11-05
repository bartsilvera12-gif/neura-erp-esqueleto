// Constantes y tipos compartidos entre server y client (NO importar server-only acá).

export const ESTADOS_HERRAMIENTA = ["FUNCIONANDO", "AVERIADA", "EN_REPARACION", "DADA_DE_BAJA"] as const;
export type EstadoHerramienta = (typeof ESTADOS_HERRAMIENTA)[number];

export const ESTADO_LABEL: Record<EstadoHerramienta, string> = {
  FUNCIONANDO: "Funcionando",
  AVERIADA: "Averiada",
  EN_REPARACION: "En reparación",
  DADA_DE_BAJA: "Dada de baja",
};
