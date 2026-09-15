-- =============================================================================
-- Ventas y presupuestos: created_by_user_id para "sus documentos" del vendedor
-- =============================================================================
-- Cubre PDF §1: "el vendedor debe poder acceder a los documentos comerciales
-- que le correspondan". Guarda el id del usuario que crea el documento, para
-- filtrar los listados de ventas y presupuestos por rol no-admin.
--
-- Idempotente y aditivo. Corre por tenant en cualquier schema con la tabla
-- 'ventas'.
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'ventas' AND c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog','information_schema')
  LOOP
    RAISE NOTICE '[ventas_presupuestos_created_by] schema=%', r.sch;

    -- Ventas
    EXECUTE format('ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS created_by_user_id uuid', r.sch);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS ix_ventas_created_by ON %I.ventas(empresa_id, created_by_user_id) WHERE created_by_user_id IS NOT NULL',
      r.sch
    );

    -- Presupuestos (si la tabla existe en este schema)
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname='presupuestos' AND n.nspname = r.sch) THEN
      EXECUTE format('ALTER TABLE %I.presupuestos ADD COLUMN IF NOT EXISTS created_by_user_id uuid', r.sch);
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS ix_presupuestos_created_by ON %I.presupuestos(empresa_id, created_by_user_id) WHERE created_by_user_id IS NOT NULL',
        r.sch
      );
    END IF;
  END LOOP;
END
$mig$;
