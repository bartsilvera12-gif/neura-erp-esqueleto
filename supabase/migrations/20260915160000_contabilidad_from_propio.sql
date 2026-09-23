-- =============================================================================
-- Contabilidad · Schema portado desde neura-erp-sistemas-propio
-- =============================================================================
-- Crea, por tenant, el motor contable minimo:
--   plan_cuentas
--   configuracion_contable
--   asientos_contables
--   asientos_contables_detalles
--   periodos_contables
--   asiento_correlativos
--
-- Y agrega columnas de contabilizacion a compras (cuenta_contable_id) y a
-- facturas/nota_credito (estado_contable, asiento_contable_id, contab_error).
--
-- Reglas: CREATE TABLE IF NOT EXISTS + ALTER ADD COLUMN IF NOT EXISTS =>
-- idempotente. No borra datos ni indices existentes.
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'empresas' AND c.relkind = 'r'
      AND n.nspname = 'esqueletoerp'  -- base compartida: solo este esquema
  LOOP
    RAISE NOTICE '[contabilidad] schema=%', r.sch;

    -- plan_cuentas
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.plan_cuentas (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id      uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        cuenta          text NOT NULL,
        denominacion    text NOT NULL,
        nivel           integer NOT NULL,
        naturaleza      text NOT NULL CHECK (naturaleza IN ('D','A')),
        asentable       boolean NOT NULL DEFAULT false,
        centro_costo    boolean NOT NULL DEFAULT false,
        moneda          text,
        tipo_cambio     text,
        cuenta_sset     text,
        cuenta_padre_id uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        activo          boolean NOT NULL DEFAULT true,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT plan_cuentas_cuenta_empresa_uk UNIQUE (empresa_id, cuenta),
        CONSTRAINT plan_cuentas_no_self_parent CHECK (cuenta_padre_id IS NULL OR cuenta_padre_id <> id)
      )
    $f$, r.sch, r.sch, r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_plan_cuentas_empresa ON %I.plan_cuentas(empresa_id, activo)', r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_plan_cuentas_padre ON %I.plan_cuentas(cuenta_padre_id)', r.sch);

    -- asientos_contables
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.asientos_contables (
        id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id            uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        numero_asiento        text NOT NULL,
        fecha_contable        date NOT NULL,
        glosa                 text,
        estado                text NOT NULL DEFAULT 'contabilizado'
                              CHECK (estado IN ('contabilizado','revertido')),
        origen_tipo           text NOT NULL
                              CHECK (origen_tipo IN ('gasto_servicio','compra','reversion','pago_proveedor',
                                                     'factura_venta','nota_credito_venta')),
        origen_id             uuid,
        evento_origen         text NOT NULL,
        moneda                text NOT NULL DEFAULT 'PYG',
        tipo_cambio           numeric NOT NULL DEFAULT 1,
        asiento_original_id   uuid REFERENCES %I.asientos_contables(id) ON DELETE SET NULL,
        asiento_reversion_id  uuid REFERENCES %I.asientos_contables(id) ON DELETE SET NULL,
        created_by            uuid,
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT asientos_numero_uk UNIQUE (empresa_id, numero_asiento)
      )
    $f$, r.sch, r.sch, r.sch, r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_asientos_empresa_fecha ON %I.asientos_contables(empresa_id, fecha_contable DESC)', r.sch);

    -- asientos_contables_detalles
    -- FK a proveedores solo si la tabla existe en el schema (compat esqueleto).
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.asientos_contables_detalles (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id         uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        asiento_id         uuid NOT NULL REFERENCES %I.asientos_contables(id) ON DELETE CASCADE,
        cuenta_contable_id uuid NOT NULL REFERENCES %I.plan_cuentas(id) ON DELETE RESTRICT,
        proveedor_id       uuid,
        descripcion        text,
        debe               numeric NOT NULL DEFAULT 0 CHECK (debe >= 0),
        haber              numeric NOT NULL DEFAULT 0 CHECK (haber >= 0),
        documento_tipo     text,
        documento_id       uuid,
        created_at         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT det_debe_xor_haber CHECK ((debe > 0 AND haber = 0) OR (haber > 0 AND debe = 0))
      )
    $f$, r.sch, r.sch, r.sch, r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_det_asiento ON %I.asientos_contables_detalles(asiento_id)', r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_det_cuenta ON %I.asientos_contables_detalles(cuenta_contable_id)', r.sch);

    -- FK proveedor_id -> proveedores si la tabla existe
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'proveedores' AND n.nspname = r.sch
    ) THEN
      BEGIN
        EXECUTE format($f$
          ALTER TABLE %I.asientos_contables_detalles
            ADD CONSTRAINT det_proveedor_fkey
            FOREIGN KEY (proveedor_id) REFERENCES %I.proveedores(id) ON DELETE SET NULL
        $f$, r.sch, r.sch);
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    -- configuracion_contable (una fila por empresa, PK = empresa_id)
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.configuracion_contable (
        empresa_id                 uuid PRIMARY KEY REFERENCES %I.empresas(id) ON DELETE CASCADE,
        cuenta_iva_credito_5_id    uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_iva_credito_10_id   uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_iva_debito_5_id     uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_iva_debito_10_id    uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_ventas_gravadas_id  uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_proveedores_id      uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_caja_id             uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_banco_id            uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        updated_by                 uuid,
        updated_at                 timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch);

    -- periodos_contables
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.periodos_contables (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id   uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        anio         integer NOT NULL,
        mes          integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
        fecha_desde  date NOT NULL,
        fecha_hasta  date NOT NULL,
        estado       text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado')),
        cerrado_by   uuid,
        cerrado_at   timestamptz,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT periodos_uk UNIQUE (empresa_id, anio, mes)
      )
    $f$, r.sch, r.sch);

    -- asiento_correlativos
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.asiento_correlativos (
        empresa_id    uuid PRIMARY KEY,
        ultimo_numero bigint NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch);

    -- ALTERs de contabilizacion en compras / facturas / nota_credito
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname='compras' AND n.nspname = r.sch) THEN
      EXECUTE format('ALTER TABLE %I.compras ADD COLUMN IF NOT EXISTS cuenta_contable_id uuid', r.sch);
      BEGIN
        EXECUTE format($f$
          ALTER TABLE %I.compras
            ADD CONSTRAINT compras_cuenta_contable_id_fkey
            FOREIGN KEY (cuenta_contable_id) REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL
        $f$, r.sch, r.sch);
      EXCEPTION WHEN duplicate_object THEN NULL; END;
      EXECUTE format('CREATE INDEX IF NOT EXISTS ix_compras_cuenta_contable ON %I.compras(empresa_id, cuenta_contable_id)', r.sch);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname='facturas' AND n.nspname = r.sch) THEN
      EXECUTE format($f$
        ALTER TABLE %I.facturas
          ADD COLUMN IF NOT EXISTS estado_contable     text NOT NULL DEFAULT 'no_contabilizado',
          ADD COLUMN IF NOT EXISTS asiento_contable_id uuid REFERENCES %I.asientos_contables(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS contab_error        text
      $f$, r.sch, r.sch);
      BEGIN
        EXECUTE format($f$
          ALTER TABLE %I.facturas
            ADD CONSTRAINT facturas_estado_contable_chk
            CHECK (estado_contable IN ('no_contabilizado','contabilizado','error','revertido'))
        $f$, r.sch);
      EXCEPTION WHEN duplicate_object THEN NULL; END;
      EXECUTE format('CREATE INDEX IF NOT EXISTS ix_facturas_estado_contable ON %I.facturas(empresa_id, estado_contable)', r.sch);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname='nota_credito' AND n.nspname = r.sch) THEN
      EXECUTE format($f$
        ALTER TABLE %I.nota_credito
          ADD COLUMN IF NOT EXISTS estado_contable     text NOT NULL DEFAULT 'no_contabilizado',
          ADD COLUMN IF NOT EXISTS asiento_contable_id uuid REFERENCES %I.asientos_contables(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS contab_error        text
      $f$, r.sch, r.sch);
      BEGIN
        EXECUTE format($f$
          ALTER TABLE %I.nota_credito
            ADD CONSTRAINT nota_credito_estado_contable_chk
            CHECK (estado_contable IN ('no_contabilizado','contabilizado','error','revertido'))
        $f$, r.sch);
      EXCEPTION WHEN duplicate_object THEN NULL; END;
      EXECUTE format('CREATE INDEX IF NOT EXISTS ix_nc_estado_contable ON %I.nota_credito(empresa_id, estado_contable)', r.sch);
    END IF;

    RAISE NOTICE '[contabilidad] % listo', r.sch;
  END LOOP;
END
$mig$;
