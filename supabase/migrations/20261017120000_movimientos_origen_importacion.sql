-- =============================================================================
-- Inventario · Movimientos: nuevo origen 'importacion'
-- =============================================================================
-- El ingreso al stock que genera la recepción de una importación se registraba
-- con origen = 'compra', indistinguible de una compra local. Ahora se marca con
-- origen = 'importacion' para que el Kardex lo muestre etiquetado como tal, y el
-- costo real se estampa al aplicar el costeo (ver /api/importaciones/:id/costeo).
--
-- Solo esqueletoerp: el módulo de importaciones (comex) existe solo en este
-- esquema, así que es el único donde se escribe este origen.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE esqueletoerp.movimientos_inventario
  DROP CONSTRAINT IF EXISTS movimientos_inventario_origen_check;

ALTER TABLE esqueletoerp.movimientos_inventario
  ADD CONSTRAINT movimientos_inventario_origen_check
  CHECK (origen IN ('compra','venta','ajuste_manual','inventario_inicial','transferencia','importacion'));

COMMIT;

NOTIFY pgrst, 'reload schema';
