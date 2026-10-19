-- =============================================================================
-- Gastos · Sin factura / facturado, cuenta contable y origen del dinero
-- =============================================================================
-- El cliente necesita, al cargar un gasto:
--   - Marcar si es "sin factura" o "facturado" (facturado).
--   - Elegir la cuenta contable del gasto (cuenta_contable_id), como en la factura.
--   - Indicar de dónde salió: un banco (entidad_bancaria_id) o una caja chica
--     (caja_chica_id, ya existía). El egreso se registra en banco_movimientos /
--     caja_chica_movimientos (gasto_id), para que baje el saldo.
--   - Gasto recurrente (recurrente, ya existía).
--
-- Solo esqueletoerp (Living Room). Columnas nullables → no afecta datos previos.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE esqueletoerp.gastos
  ADD COLUMN IF NOT EXISTS facturado boolean NOT NULL DEFAULT true;

ALTER TABLE esqueletoerp.gastos
  ADD COLUMN IF NOT EXISTS cuenta_contable_id uuid
    REFERENCES esqueletoerp.plan_cuentas(id) ON DELETE SET NULL;

ALTER TABLE esqueletoerp.gastos
  ADD COLUMN IF NOT EXISTS entidad_bancaria_id uuid
    REFERENCES esqueletoerp.entidades_bancarias(id) ON DELETE SET NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
