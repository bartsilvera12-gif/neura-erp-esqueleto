-- =============================================================================
-- Gastos · Proveedor / persona + RUC o CI
-- =============================================================================
-- El cliente necesita, al cargar un gasto, poder indicar a quién se le pagó
-- (proveedor o persona) y su documento (RUC o CI), además de hacer obligatorio
-- de dónde salió el dinero (eso se valida en el backend, no requiere columna).
--
-- Solo esqueletoerp (Living Room). Columnas nullables → no afecta datos previos.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE esqueletoerp.gastos
  ADD COLUMN IF NOT EXISTS proveedor_nombre text;

ALTER TABLE esqueletoerp.gastos
  ADD COLUMN IF NOT EXISTS proveedor_documento text;

COMMIT;

NOTIFY pgrst, 'reload schema';
