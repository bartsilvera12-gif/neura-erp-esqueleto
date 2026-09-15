-- =============================================================================
-- Modulo Importaciones (PDF §5)
-- =============================================================================
-- Circuito completo: expediente + items esperados + caja en moneda extranjera
-- + trazabilidad de la mercaderia entre almacen exterior y almacen Paraguay.
--
-- El almacen exterior vs PY se distingue por inventario_ubicaciones.pais:
--   'PY' | 'EXTERIOR' | 'BOL' | 'OTRO'.
--
-- Idempotente. Corre por tenant.
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'empresas' AND c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog','information_schema')
  LOOP
    RAISE NOTICE '[modulo_importaciones] schema=%', r.sch;

    -- 1) inventario_ubicaciones.pais (marcado PY/EXTERIOR)
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname='inventario_ubicaciones' AND n.nspname = r.sch) THEN
      EXECUTE format('ALTER TABLE %I.inventario_ubicaciones ADD COLUMN IF NOT EXISTS pais text', r.sch);
      BEGIN
        EXECUTE format($f$
          ALTER TABLE %I.inventario_ubicaciones
            ADD CONSTRAINT inv_ubic_pais_check
            CHECK (pais IS NULL OR pais IN ('PY','EXTERIOR','BOL','OTRO'))
        $f$, r.sch);
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    -- 2) importaciones (expediente)
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.importaciones (
        id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id               uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        numero                   text NOT NULL,
        proveedor_id             uuid,
        proveedor_nombre         text,
        pais_origen              text NOT NULL DEFAULT 'BOL',
        incoterm                 text,
        moneda                   text NOT NULL DEFAULT 'USD' CHECK (moneda IN ('PYG','USD','BOB')),
        monto_estimado           numeric NOT NULL DEFAULT 0,
        tipo_cambio              numeric NOT NULL DEFAULT 1,
        fecha_pedido             date,
        fecha_embarque           date,
        fecha_arribo             date,
        fecha_nacionalizacion    date,
        ubicacion_exterior_id    uuid,
        ubicacion_destino_py_id  uuid,
        estado                   text NOT NULL DEFAULT 'borrador'
                                 CHECK (estado IN ('borrador','en_transito','arribado','nacionalizada','entregada','cerrada','anulada')),
        observaciones            text,
        created_by_user_id       uuid,
        created_at               timestamptz NOT NULL DEFAULT now(),
        updated_at               timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT importaciones_numero_uk UNIQUE (empresa_id, numero)
      )
    $f$, r.sch, r.sch);

    -- FKs opcionales (a proveedores + ubicaciones si existen)
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname='proveedores' AND n.nspname = r.sch) THEN
      BEGIN
        EXECUTE format($f$
          ALTER TABLE %I.importaciones
            ADD CONSTRAINT importaciones_proveedor_fkey
            FOREIGN KEY (proveedor_id) REFERENCES %I.proveedores(id) ON DELETE SET NULL
        $f$, r.sch, r.sch);
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname='inventario_ubicaciones' AND n.nspname = r.sch) THEN
      BEGIN
        EXECUTE format($f$
          ALTER TABLE %I.importaciones
            ADD CONSTRAINT importaciones_ubic_ext_fkey
            FOREIGN KEY (ubicacion_exterior_id) REFERENCES %I.inventario_ubicaciones(id) ON DELETE SET NULL
        $f$, r.sch, r.sch);
      EXCEPTION WHEN duplicate_object THEN NULL; END;
      BEGIN
        EXECUTE format($f$
          ALTER TABLE %I.importaciones
            ADD CONSTRAINT importaciones_ubic_py_fkey
            FOREIGN KEY (ubicacion_destino_py_id) REFERENCES %I.inventario_ubicaciones(id) ON DELETE SET NULL
        $f$, r.sch, r.sch);
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_importaciones_empresa_estado ON %I.importaciones(empresa_id, estado)', r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_importaciones_fecha_arribo ON %I.importaciones(empresa_id, fecha_arribo DESC)', r.sch);

    -- 3) importacion_items
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.importacion_items (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id        uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        importacion_id    uuid NOT NULL REFERENCES %I.importaciones(id) ON DELETE CASCADE,
        producto_id       uuid,
        producto_nombre   text NOT NULL,
        sku               text,
        cantidad          numeric NOT NULL CHECK (cantidad > 0),
        precio_unitario   numeric NOT NULL DEFAULT 0,
        moneda            text NOT NULL DEFAULT 'USD' CHECK (moneda IN ('PYG','USD','BOB')),
        subtotal          numeric NOT NULL DEFAULT 0,
        cantidad_recibida numeric NOT NULL DEFAULT 0,
        observacion       text,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch, r.sch);
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname='productos' AND n.nspname = r.sch) THEN
      BEGIN
        EXECUTE format($f$
          ALTER TABLE %I.importacion_items
            ADD CONSTRAINT importacion_items_producto_fkey
            FOREIGN KEY (producto_id) REFERENCES %I.productos(id) ON DELETE SET NULL
        $f$, r.sch, r.sch);
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_imp_items_importacion ON %I.importacion_items(importacion_id)', r.sch);

    -- 4) importacion_caja (caja/tesoreria por expediente)
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.importacion_caja (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id         uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        importacion_id     uuid NOT NULL REFERENCES %I.importaciones(id) ON DELETE CASCADE,
        tipo               text NOT NULL CHECK (tipo IN ('entrada','salida')),
        concepto           text NOT NULL,
        monto              numeric NOT NULL CHECK (monto > 0),
        moneda             text NOT NULL DEFAULT 'USD' CHECK (moneda IN ('PYG','USD','BOB')),
        tipo_cambio        numeric NOT NULL DEFAULT 1,
        fecha              date NOT NULL DEFAULT current_date,
        referencia         text,
        observacion        text,
        banco_movimiento_id uuid,
        created_by_user_id uuid,
        usuario_nombre     text,
        created_at         timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch, r.sch);
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname='banco_movimientos' AND n.nspname = r.sch) THEN
      BEGIN
        EXECUTE format($f$
          ALTER TABLE %I.importacion_caja
            ADD CONSTRAINT importacion_caja_banco_fkey
            FOREIGN KEY (banco_movimiento_id) REFERENCES %I.banco_movimientos(id) ON DELETE SET NULL
        $f$, r.sch, r.sch);
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_imp_caja_importacion_fecha ON %I.importacion_caja(importacion_id, fecha DESC)', r.sch);
  END LOOP;
END
$mig$;
