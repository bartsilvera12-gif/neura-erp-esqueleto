/**
 * Aislamiento Living Room.
 *
 * La columna `nombre_importacion` (y los agregados del importador/export que la
 * acompañan) existe SOLO en el esquema `esqueletoerp`. El código es compartido
 * por todos los tenants, así que todo lo nuevo se aplica únicamente cuando el
 * esquema del tenant es `esqueletoerp`. Para cualquier otro esquema, el código
 * se comporta exactamente como antes (no selecciona ni escribe esas columnas),
 * garantizando que otros clientes no se vean afectados.
 */
export const SCHEMA_LR = "esqueletoerp";

export function soportaCamposLR(schema: string | null | undefined): boolean {
  return (schema ?? "") === SCHEMA_LR;
}
