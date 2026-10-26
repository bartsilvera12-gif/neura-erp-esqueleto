-- =============================================================================
-- Secciones: Showroom / Producción / Comercio Exterior
-- =============================================================================
-- El cliente pide separar gastos y libro de compras por sección, con un
-- "Libro de compras general" (Contabilidad) que consolida las tres. Se agrega
-- la columna `seccion` a libro_compras y gastos. Todo lo ya cargado queda como
-- SHOWROOM (default). La unicidad de factura ya es global por empresa, así que
-- una misma factura no se puede cargar dos veces aunque sea en otra sección.
--
-- Solo esqueletoerp (Living Room). Columnas con default → no afecta datos previos.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE esqueletoerp.libro_compras
  ADD COLUMN IF NOT EXISTS seccion text NOT NULL DEFAULT 'SHOWROOM';

ALTER TABLE esqueletoerp.libro_compras
  DROP CONSTRAINT IF EXISTS libro_compras_seccion_chk;
ALTER TABLE esqueletoerp.libro_compras
  ADD CONSTRAINT libro_compras_seccion_chk
    CHECK (seccion IN ('SHOWROOM', 'PRODUCCION', 'COMERCIO_EXTERIOR'));

CREATE INDEX IF NOT EXISTS libro_compras_seccion_idx
  ON esqueletoerp.libro_compras (empresa_id, seccion);

ALTER TABLE esqueletoerp.gastos
  ADD COLUMN IF NOT EXISTS seccion text NOT NULL DEFAULT 'SHOWROOM';

ALTER TABLE esqueletoerp.gastos
  DROP CONSTRAINT IF EXISTS gastos_seccion_chk;
ALTER TABLE esqueletoerp.gastos
  ADD CONSTRAINT gastos_seccion_chk
    CHECK (seccion IN ('SHOWROOM', 'PRODUCCION', 'COMERCIO_EXTERIOR'));

CREATE INDEX IF NOT EXISTS gastos_seccion_idx
  ON esqueletoerp.gastos (empresa_id, seccion);

COMMIT;

NOTIFY pgrst, 'reload schema';
