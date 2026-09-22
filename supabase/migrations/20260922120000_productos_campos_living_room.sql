-- =============================================================================
-- Productos · Campos del inventario Living Room (Bolivia)
-- =============================================================================
-- Agrega las columnas que hoy Bryan carga a mano en el Excel mensual
-- "INVENTARIO DE STOCK ASUNCION PARAGUAY":
--   cantidad_importacion    numeric  — cuánto vino en la importación (dato histórico)
--   show_room               numeric  — cuántas están en exhibición hoy
--   exportacion_bolivia     numeric  — cuánto se re-exportó a BOL (acumulado)
--   observaciones           text     — texto libre
--   posible_solucion        text     — texto libre
--
-- Idempotente + aditivo. Corre por tenant.
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'productos' AND c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog','information_schema')
  LOOP
    RAISE NOTICE '[productos_campos_living_room] schema=%', r.sch;

    EXECUTE format($f$
      ALTER TABLE %I.productos
        ADD COLUMN IF NOT EXISTS cantidad_importacion numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS show_room            numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS exportacion_bolivia  numeric NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS observaciones        text,
        ADD COLUMN IF NOT EXISTS posible_solucion     text
    $f$, r.sch);
  END LOOP;
END
$mig$;
