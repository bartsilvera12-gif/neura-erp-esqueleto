-- =============================================================================
-- Recibos de dinero · Depósito a banco + foto del depósito
-- =============================================================================
-- El cliente necesita, para cada recibo, poder indicar a dónde fue el dinero:
--   - Elegir el banco al que se depositó (deposito_entidad_bancaria_id).
--   - Adjuntar una foto del comprobante del depósito (deposito_foto_path, en el
--     bucket privado `recibos-depositos`).
--   - Que el ingreso figure en el banco: al registrar el depósito se crea un
--     movimiento de banco tipo "deposito" (ingreso) y se guarda su id en
--     deposito_banco_movimiento_id. Si no se registra el depósito, el banco no
--     muestra ese ingreso.
--
-- Solo esqueletoerp (Living Room). Columnas nullables → no afecta datos previos.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE esqueletoerp.recibos_dinero
  ADD COLUMN IF NOT EXISTS deposito_entidad_bancaria_id uuid
    REFERENCES esqueletoerp.entidades_bancarias(id) ON DELETE SET NULL;

ALTER TABLE esqueletoerp.recibos_dinero
  ADD COLUMN IF NOT EXISTS deposito_foto_path text;

ALTER TABLE esqueletoerp.recibos_dinero
  ADD COLUMN IF NOT EXISTS deposito_fecha date;

ALTER TABLE esqueletoerp.recibos_dinero
  ADD COLUMN IF NOT EXISTS deposito_banco_movimiento_id uuid;

-- Traza del lado del banco: qué recibo originó el ingreso.
ALTER TABLE esqueletoerp.banco_movimientos
  ADD COLUMN IF NOT EXISTS recibo_dinero_id uuid
    REFERENCES esqueletoerp.recibos_dinero(id) ON DELETE SET NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
