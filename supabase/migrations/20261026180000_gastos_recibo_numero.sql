-- =============================================================================
-- Gastos · Número de recibo por sección (SHLR / PRLR / CELR)
-- =============================================================================
-- Los recibos de gasto SIN factura se numeran y no se repiten, con un correlativo
-- por sección:
--   Showroom          -> SHLR-000001, SHLR-000002, ...
--   Producción        -> PRLR-000001, ...
--   Comercio Exterior -> CELR-000001, ...
-- El número se asigna al crear el gasto sin factura. Solo esqueletoerp.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE esqueletoerp.gastos
  ADD COLUMN IF NOT EXISTS recibo_numero text;

-- Un número de recibo no se repite dentro de la empresa (los nulos no cuentan).
CREATE UNIQUE INDEX IF NOT EXISTS gastos_recibo_numero_uq
  ON esqueletoerp.gastos (empresa_id, recibo_numero)
  WHERE recibo_numero IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
