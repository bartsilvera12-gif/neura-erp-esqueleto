-- =============================================================================
-- Producción de muebles · Fase 6b: precio de venta y rentabilidad del proyecto
-- =============================================================================
-- Según la especificación (sección 5.9): registrar precio de venta acordado,
-- descuentos e ingreso final para calcular utilidad y margen. Se distingue el
-- ingreso previsto (precio − descuento) del ingreso final reconocido.
-- Solo esqueletoerp (Living Room). Idempotente.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE esqueletoerp.prod_proyectos ADD COLUMN IF NOT EXISTS precio_venta     numeric NOT NULL DEFAULT 0;  -- precio de venta acordado (ingreso previsto bruto)
ALTER TABLE esqueletoerp.prod_proyectos ADD COLUMN IF NOT EXISTS descuento_venta  numeric NOT NULL DEFAULT 0;  -- descuento sobre el precio de venta
ALTER TABLE esqueletoerp.prod_proyectos ADD COLUMN IF NOT EXISTS ingreso_final    numeric NOT NULL DEFAULT 0;  -- ingreso final reconocido (facturado/cobrado)

COMMIT;

NOTIFY pgrst, 'reload schema';
