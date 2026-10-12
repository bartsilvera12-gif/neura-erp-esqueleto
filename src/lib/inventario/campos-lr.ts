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
import { NEURA_CLIENT_SCHEMA } from "@/lib/supabase/schema";

export const SCHEMA_LR = "esqueletoerp";

export function soportaCamposLR(schema: string | null | undefined): boolean {
  return (schema ?? "") === SCHEMA_LR;
}

/**
 * Esta instancia (deploy single_client) opera sobre esqueletoerp (Living Room).
 * Isomórfico: en server usa NEURA_CLIENT_SCHEMA, en browser NEXT_PUBLIC_NEURA_CLIENT_SCHEMA.
 * Úsese para gatear lógica LR en código compartido sin consultar la base.
 */
export function esInstanciaLR(): boolean {
  return soportaCamposLR(NEURA_CLIENT_SCHEMA);
}
