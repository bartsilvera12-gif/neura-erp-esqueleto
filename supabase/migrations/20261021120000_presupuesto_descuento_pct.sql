-- =============================================================================
-- Presupuestos · Descuento por porcentaje (Living Room)
-- =============================================================================
-- El cliente carga el descuento como % (ej. 10%) y el sistema calcula el precio
-- unitario con descuento. Guardamos el % en descuento_pct para poder mostrarlo
-- y reeditarlo; el monto de descuento absoluto se sigue guardando en `descuento`.
--
-- Solo esqueletoerp (Living Room). Columna nullable → no afecta datos previos.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE esqueletoerp.presupuesto_items
  ADD COLUMN IF NOT EXISTS descuento_pct numeric;

COMMIT;

NOTIFY pgrst, 'reload schema';
