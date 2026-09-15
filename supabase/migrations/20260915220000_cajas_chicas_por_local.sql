-- =============================================================================
-- Caja chica por local (PDF §2)
-- =============================================================================
-- Cada sucursal puede tener una o mas cajas chicas. Los aportes, gastos,
-- retiros y ajustes quedan registrados en caja_chica_movimientos y el saldo
-- se calcula como SUM(monto_signed).
--
-- Ademas: gastos.sucursal_id + gastos.caja_chica_id para poder imputar cada
-- gasto a un local y su caja chica.
--
-- Idempotente. Corre en cualquier schema con la tabla 'sucursales'.
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'sucursales' AND c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog','information_schema')
  LOOP
    RAISE NOTICE '[cajas_chicas_por_local] schema=%', r.sch;

    -- cajas_chicas
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.cajas_chicas (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id    uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        sucursal_id   uuid REFERENCES %I.sucursales(id) ON DELETE SET NULL,
        nombre        text NOT NULL,
        moneda        text NOT NULL DEFAULT 'PYG' CHECK (moneda IN ('PYG','USD')),
        tope_gasto    numeric,
        activa        boolean NOT NULL DEFAULT true,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch, r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_cajas_chicas_empresa ON %I.cajas_chicas(empresa_id, activa)', r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_cajas_chicas_sucursal ON %I.cajas_chicas(sucursal_id)', r.sch);

    -- caja_chica_movimientos
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.caja_chica_movimientos (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id         uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        caja_chica_id      uuid NOT NULL REFERENCES %I.cajas_chicas(id) ON DELETE CASCADE,
        tipo               text NOT NULL CHECK (tipo IN ('aporte','gasto','retiro','ajuste','saldo_inicial')),
        monto              numeric NOT NULL CHECK (monto <> 0),
        fecha              date NOT NULL DEFAULT current_date,
        referencia         text,
        observacion        text,
        gasto_id           uuid,
        created_by_user_id uuid,
        usuario_nombre     text,
        created_at         timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch, r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_ccm_caja_fecha ON %I.caja_chica_movimientos(caja_chica_id, fecha DESC)', r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_ccm_empresa_fecha ON %I.caja_chica_movimientos(empresa_id, fecha DESC)', r.sch);

    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname='gastos' AND n.nspname = r.sch) THEN
      BEGIN
        EXECUTE format($f$
          ALTER TABLE %I.caja_chica_movimientos
            ADD CONSTRAINT ccm_gasto_id_fkey
            FOREIGN KEY (gasto_id) REFERENCES %I.gastos(id) ON DELETE SET NULL
        $f$, r.sch, r.sch);
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    -- gastos.sucursal_id + gastos.caja_chica_id
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname='gastos' AND n.nspname = r.sch) THEN
      EXECUTE format('ALTER TABLE %I.gastos ADD COLUMN IF NOT EXISTS sucursal_id uuid', r.sch);
      EXECUTE format('ALTER TABLE %I.gastos ADD COLUMN IF NOT EXISTS caja_chica_id uuid', r.sch);
      BEGIN
        EXECUTE format($f$
          ALTER TABLE %I.gastos
            ADD CONSTRAINT gastos_sucursal_id_fkey
            FOREIGN KEY (sucursal_id) REFERENCES %I.sucursales(id) ON DELETE SET NULL
        $f$, r.sch, r.sch);
      EXCEPTION WHEN duplicate_object THEN NULL; END;
      BEGIN
        EXECUTE format($f$
          ALTER TABLE %I.gastos
            ADD CONSTRAINT gastos_caja_chica_id_fkey
            FOREIGN KEY (caja_chica_id) REFERENCES %I.cajas_chicas(id) ON DELETE SET NULL
        $f$, r.sch, r.sch);
      EXCEPTION WHEN duplicate_object THEN NULL; END;
      EXECUTE format('CREATE INDEX IF NOT EXISTS ix_gastos_sucursal ON %I.gastos(empresa_id, sucursal_id) WHERE sucursal_id IS NOT NULL', r.sch);
      EXECUTE format('CREATE INDEX IF NOT EXISTS ix_gastos_caja_chica ON %I.gastos(empresa_id, caja_chica_id) WHERE caja_chica_id IS NOT NULL', r.sch);
    END IF;
  END LOOP;
END
$mig$;
