/** Valida los campos editables de un punto de expedición. Devuelve el mensaje de error o null. */
export function validarConfigPunto(c: {
  timbrado: string;
  establecimiento: string;
  punto_expedicion: string;
  vigencia_desde: string;
  vigencia_hasta: string;
  rango_desde: number;
  rango_hasta: number;
  proximo_numero: number;
}): string | null {
  if (!/^\d{8}$/.test(c.timbrado)) return "El timbrado tiene que tener 8 dígitos.";
  if (!/^\d{3}$/.test(c.establecimiento) || !/^\d{3}$/.test(c.punto_expedicion))
    return "Establecimiento y punto van con 3 dígitos (ej: 001 y 004).";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.vigencia_desde) || !/^\d{4}-\d{2}-\d{2}$/.test(c.vigencia_hasta))
    return "Cargá las dos fechas de vigencia.";
  if (c.vigencia_hasta < c.vigencia_desde) return "La vigencia termina antes de empezar.";
  if (!(c.rango_desde >= 1) || !(c.rango_hasta >= c.rango_desde)) return "El rango autorizado no es válido.";
  if (c.proximo_numero < c.rango_desde || c.proximo_numero > c.rango_hasta + 1)
    return `El próximo número tiene que estar entre ${c.rango_desde} y ${c.rango_hasta}.`;
  return null;
}
