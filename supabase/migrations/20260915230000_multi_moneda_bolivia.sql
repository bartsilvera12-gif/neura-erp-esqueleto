-- =============================================================================
-- Multi-moneda + Bolivia (PDF §2 · Criterio 05)
-- =============================================================================
-- Deja el esqueleto listo para operar con moneda de origen ajena al PYG
-- (foco: BOB por Bolivia; queda extensible a otras). Se agregan:
--   1. Catalogo tipos_cambio (tasas diarias por par).
--   2. Ampliacion de las columnas 'moneda' en gastos/banco_movimientos/
--      cajas_chicas/caja_chica_movimientos para admitir BOB.
--   3. gastos.moneda + gastos.tipo_cambio (para gastos en USD/BOB).
--   4. banco_movimientos.pais_origen para trazar fondos desde Bolivia.
--
-- Idempotente. Corre por tenant.
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
  v_check text;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'empresas' AND c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog','information_schema')
  LOOP
    RAISE NOTICE '[multi_moneda_bolivia] schema=%', r.sch;

    -- 1) tipos_cambio: catalogo de tasas
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.tipos_cambio (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id      uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        fecha           date NOT NULL DEFAULT current_date,
        moneda_origen   text NOT NULL,
        moneda_destino  text NOT NULL,
        tasa            numeric NOT NULL CHECK (tasa > 0),
        observacion     text,
        created_by_user_id uuid,
        created_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT tipos_cambio_par_distinto CHECK (moneda_origen <> moneda_destino)
      )
    $f$, r.sch, r.sch);
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_tipos_cambio_dia
         ON %I.tipos_cambio(empresa_id, fecha, moneda_origen, moneda_destino)',
      r.sch
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS ix_tipos_cambio_par_fecha
         ON %I.tipos_cambio(empresa_id, moneda_origen, moneda_destino, fecha DESC)',
      r.sch
    );

    -- 2) Ampliar CHECK moneda para incluir BOB en tablas que lo restringen.
    -- Estrategia: dropear el CHECK existente si esta y volver a crearlo con
    -- 'BOB' incluido. Se hace tabla por tabla.

    -- gastos.moneda + tipo_cambio (nuevos)
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname='gastos' AND n.nspname = r.sch) THEN
      EXECUTE format('ALTER TABLE %I.gastos ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT ''PYG''', r.sch);
      EXECUTE format('ALTER TABLE %I.gastos ADD COLUMN IF NOT EXISTS tipo_cambio numeric NOT NULL DEFAULT 1', r.sch);
      BEGIN
        EXECUTE format('ALTER TABLE %I.gastos DROP CONSTRAINT IF EXISTS gastos_moneda_check', r.sch);
        EXECUTE format(
          'ALTER TABLE %I.gastos ADD CONSTRAINT gastos_moneda_check CHECK (moneda IN (''PYG'',''USD'',''BOB''))',
          r.sch
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    -- banco_movimientos.moneda incluye BOB + pais_origen
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname='banco_movimientos' AND n.nspname = r.sch) THEN
      EXECUTE format('ALTER TABLE %I.banco_movimientos ADD COLUMN IF NOT EXISTS pais_origen text', r.sch);
      EXECUTE format('ALTER TABLE %I.banco_movimientos ADD COLUMN IF NOT EXISTS tipo_cambio numeric NOT NULL DEFAULT 1', r.sch);
      -- El CHECK original permitia solo PYG/USD; hay que expandirlo.
      SELECT conname INTO v_check
      FROM pg_constraint pgc
      JOIN pg_class pc ON pc.oid = pgc.conrelid
      JOIN pg_namespace pn ON pn.oid = pc.relnamespace
      WHERE pn.nspname = r.sch AND pc.relname = 'banco_movimientos'
        AND pgc.contype = 'c' AND pg_get_constraintdef(pgc.oid) ILIKE '%moneda%'
      LIMIT 1;
      IF v_check IS NOT NULL THEN
        EXECUTE format('ALTER TABLE %I.banco_movimientos DROP CONSTRAINT %I', r.sch, v_check);
      END IF;
      BEGIN
        EXECUTE format(
          'ALTER TABLE %I.banco_movimientos ADD CONSTRAINT banco_movimientos_moneda_check CHECK (moneda IN (''PYG'',''USD'',''BOB''))',
          r.sch
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    -- cajas_chicas.moneda incluye BOB
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname='cajas_chicas' AND n.nspname = r.sch) THEN
      SELECT conname INTO v_check
      FROM pg_constraint pgc
      JOIN pg_class pc ON pc.oid = pgc.conrelid
      JOIN pg_namespace pn ON pn.oid = pc.relnamespace
      WHERE pn.nspname = r.sch AND pc.relname = 'cajas_chicas'
        AND pgc.contype = 'c' AND pg_get_constraintdef(pgc.oid) ILIKE '%moneda%'
      LIMIT 1;
      IF v_check IS NOT NULL THEN
        EXECUTE format('ALTER TABLE %I.cajas_chicas DROP CONSTRAINT %I', r.sch, v_check);
      END IF;
      BEGIN
        EXECUTE format(
          'ALTER TABLE %I.cajas_chicas ADD CONSTRAINT cajas_chicas_moneda_check CHECK (moneda IN (''PYG'',''USD'',''BOB''))',
          r.sch
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    v_check := NULL;
  END LOOP;
END
$mig$;
