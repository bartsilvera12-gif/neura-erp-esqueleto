/** País de un depósito: PY (Paraguay), BOL (Bolivia) o EXTERIOR. Vacío = sin marcar (se toma como PY). */
export const PAISES_DEPOSITO = [
  { value: "PY", label: "Paraguay (PY)" },
  { value: "BOL", label: "Bolivia (BOL)" },
  { value: "EXTERIOR", label: "Otro exterior" },
] as const;

export function normalizarPaisDeposito(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return PAISES_DEPOSITO.some((p) => p.value === s) ? s : null;
}
