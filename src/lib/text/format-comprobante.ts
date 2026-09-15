/**
 * Formatea un timbrado/número de comprobante SIFEN como 000-000-0000000
 * mientras el usuario tipea. Acepta cualquier entrada, saca no-dígitos y
 * agrega guiones automáticamente después del 3er y 6to dígito.
 */
export function formatComprobante(input: string): string {
  const digits = (input || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}
