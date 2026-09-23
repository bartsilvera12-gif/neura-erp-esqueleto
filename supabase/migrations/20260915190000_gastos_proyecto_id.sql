-- =============================================================================
-- Gastos ↔ Proyecto (PDF §2 "Fondos por proyecto")
-- =============================================================================
-- Vincula cada gasto opcionalmente a un proyecto para poder calcular el saldo
-- de fondos por proyecto (gastos imputados vs. presupuesto asignado).
--
-- Idempotente + aditivo. Corre en cualquier schema con la tabla 'gastos'.
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'gastos' AND c.relkind = 'r'
      AND n.nspname = 'esqueletoerp'  -- base compartida: solo este esquema
  LOOP
    RAISE NOTICE '[gastos_proyecto_id] schema=%', r.sch;

    EXECUTE format('ALTER TABLE %I.gastos ADD COLUMN IF NOT EXISTS proyecto_id uuid', r.sch);

    -- FK a proyectos si la tabla existe en el mismo schema.
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname='proyectos' AND n.nspname = r.sch) THEN
      BEGIN
        EXECUTE format($f$
          ALTER TABLE %I.gastos
            ADD CONSTRAINT gastos_proyecto_id_fkey
            FOREIGN KEY (proyecto_id) REFERENCES %I.proyectos(id) ON DELETE SET NULL
        $f$, r.sch, r.sch);
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS ix_gastos_proyecto ON %I.gastos(empresa_id, proyecto_id) WHERE proyecto_id IS NOT NULL',
      r.sch
    );
  END LOOP;
END
$mig$;
