-- =============================================================================
-- Productos · VENDIDO (Excel "INVENTARIO DE STOCK ASUNCION PARAGUAY")
-- En el Excel de Living Room VENDIDO se carga a mano y
-- SALDO FINAL = CANTIDAD DE IMPORTACION − VENDIDO − EXPORTACION BOLIVIA.
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
    EXECUTE format(
      'ALTER TABLE %I.productos ADD COLUMN IF NOT EXISTS vendido numeric NOT NULL DEFAULT 0',
      r.sch
    );
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
