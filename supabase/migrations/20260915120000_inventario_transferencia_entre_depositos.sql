-- =============================================================================
-- Inventario · Transferencia entre depositos
-- =============================================================================
-- Objetivo (PDF Requerimientos §1):
--   Permitir mover stock de un deposito de origen a otro de destino en una
--   sola operacion atomica:
--     · valida existencia disponible en origen,
--     · descuenta cantidad de inventario_stock_ubicacion (origen),
--     · suma cantidad en inventario_stock_ubicacion (destino, crea fila si no
--       existe),
--     · registra 2 filas en movimientos_inventario (SALIDA + ENTRADA) ligadas
--       por transferencia_id con origen = 'transferencia'.
--
-- Cambios de esquema (por tenant, sobre movimientos_inventario):
--   · CHECK de columna origen amplia a 'transferencia'.
--   · Nuevas columnas:
--       - transferencia_id     uuid   (agrupa el par SALIDA+ENTRADA)
--       - ubicacion_origen_id  uuid   (FK inventario_ubicaciones, en la SALIDA)
--       - ubicacion_destino_id uuid   (FK inventario_ubicaciones, en la ENTRADA)
--       - observacion          text
--
-- Funcion nueva:
--   transferir_stock_entre_depositos(
--     empresa_id, producto_id, cantidad,
--     ubic_origen_id, ubic_destino_id,
--     observacion, usuario_id
--   ) RETURNS uuid  -- transferencia_id generada
--
-- Idempotente: usa IF NOT EXISTS / DROP+CREATE FUNCTION. Corre para cada schema
-- de tenant (excluye templates zentra_erp e instemaqerp_template).
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_namespace n
    JOIN pg_class c ON c.relnamespace = n.oid
    WHERE c.relname = 'movimientos_inventario'
      AND n.nspname NOT IN ('pg_catalog','information_schema')
  LOOP
    RAISE NOTICE '[transferencia_depositos] schema=%', r.sch;

    -- 1) Ampliar CHECK de origen para permitir 'transferencia'.
    EXECUTE format($f$
      ALTER TABLE %I.movimientos_inventario
        DROP CONSTRAINT IF EXISTS movimientos_inventario_origen_check
    $f$, r.sch);

    EXECUTE format($f$
      ALTER TABLE %I.movimientos_inventario
        ADD CONSTRAINT movimientos_inventario_origen_check
        CHECK (origen IN ('compra','venta','ajuste_manual','inventario_inicial','transferencia'))
    $f$, r.sch);

    -- 2) Nuevas columnas.
    EXECUTE format($f$
      ALTER TABLE %I.movimientos_inventario
        ADD COLUMN IF NOT EXISTS transferencia_id     uuid,
        ADD COLUMN IF NOT EXISTS ubicacion_origen_id  uuid,
        ADD COLUMN IF NOT EXISTS ubicacion_destino_id uuid,
        ADD COLUMN IF NOT EXISTS observacion          text
    $f$, r.sch);

    -- 3) FKs a inventario_ubicaciones.
    BEGIN
      EXECUTE format($f$
        ALTER TABLE %I.movimientos_inventario
          DROP CONSTRAINT IF EXISTS movimientos_inventario_ubic_origen_fkey
      $f$, r.sch);
      EXECUTE format($f$
        ALTER TABLE %I.movimientos_inventario
          ADD CONSTRAINT movimientos_inventario_ubic_origen_fkey
          FOREIGN KEY (ubicacion_origen_id)
          REFERENCES %I.inventario_ubicaciones(id) ON DELETE SET NULL
      $f$, r.sch, r.sch);

      EXECUTE format($f$
        ALTER TABLE %I.movimientos_inventario
          DROP CONSTRAINT IF EXISTS movimientos_inventario_ubic_destino_fkey
      $f$, r.sch);
      EXECUTE format($f$
        ALTER TABLE %I.movimientos_inventario
          ADD CONSTRAINT movimientos_inventario_ubic_destino_fkey
          FOREIGN KEY (ubicacion_destino_id)
          REFERENCES %I.inventario_ubicaciones(id) ON DELETE SET NULL
      $f$, r.sch, r.sch);
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '[transferencia_depositos] % sin inventario_ubicaciones; FKs omitidas', r.sch;
    END;

    -- 4) Indice por transferencia_id.
    EXECUTE format($f$
      CREATE INDEX IF NOT EXISTS idx_movimientos_transferencia
        ON %I.movimientos_inventario (transferencia_id)
        WHERE transferencia_id IS NOT NULL
    $f$, r.sch);

    -- 5) Funcion atomica de transferencia.
    EXECUTE format($f$
      CREATE OR REPLACE FUNCTION %I.transferir_stock_entre_depositos(
        p_empresa_id         uuid,
        p_producto_id        uuid,
        p_cantidad           numeric,
        p_ubic_origen_id     uuid,
        p_ubic_destino_id    uuid,
        p_observacion        text  DEFAULT NULL,
        p_usuario_id         uuid  DEFAULT NULL
      ) RETURNS uuid
      LANGUAGE plpgsql
      AS $fn$
      DECLARE
        v_transferencia_id uuid := gen_random_uuid();
        v_stock_origen     numeric;
        v_producto_nombre  text;
        v_producto_sku     text;
        v_costo_unitario   numeric;
        v_ref              text;
      BEGIN
        IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
          RAISE EXCEPTION 'La cantidad debe ser mayor a cero (recibido: %)', p_cantidad;
        END IF;

        IF p_ubic_origen_id = p_ubic_destino_id THEN
          RAISE EXCEPTION 'El deposito de origen y destino deben ser distintos';
        END IF;

        SELECT nombre, sku, COALESCE(costo_promedio, 0)
          INTO v_producto_nombre, v_producto_sku, v_costo_unitario
        FROM %I.productos
        WHERE id = p_producto_id AND empresa_id = p_empresa_id;

        IF v_producto_nombre IS NULL THEN
          RAISE EXCEPTION 'Producto % no existe en esta empresa', p_producto_id;
        END IF;

        SELECT stock_actual INTO v_stock_origen
        FROM %I.inventario_stock_ubicacion
        WHERE empresa_id  = p_empresa_id
          AND producto_id = p_producto_id
          AND ubicacion_id = p_ubic_origen_id
        FOR UPDATE;

        IF v_stock_origen IS NULL THEN
          RAISE EXCEPTION 'El producto no tiene stock registrado en el deposito de origen';
        END IF;

        IF v_stock_origen < p_cantidad THEN
          RAISE EXCEPTION 'Stock insuficiente en origen: disponible % (solicitado %)',
            v_stock_origen, p_cantidad;
        END IF;

        -- Descontar de origen.
        UPDATE %I.inventario_stock_ubicacion
        SET stock_actual = stock_actual - p_cantidad,
            updated_at   = now()
        WHERE empresa_id  = p_empresa_id
          AND producto_id = p_producto_id
          AND ubicacion_id = p_ubic_origen_id;

        -- Sumar en destino (upsert).
        INSERT INTO %I.inventario_stock_ubicacion
          (empresa_id, producto_id, ubicacion_id, stock_actual)
        VALUES (p_empresa_id, p_producto_id, p_ubic_destino_id, p_cantidad)
        ON CONFLICT (empresa_id, producto_id, ubicacion_id)
        DO UPDATE SET stock_actual = %I.inventario_stock_ubicacion.stock_actual + EXCLUDED.stock_actual,
                      updated_at   = now();

        v_ref := 'TRANSF-' || substr(v_transferencia_id::text, 1, 8);

        -- Movimiento SALIDA (origen).
        INSERT INTO %I.movimientos_inventario
          (empresa_id, producto_id, producto_nombre, producto_sku,
           tipo, cantidad, costo_unitario, origen, referencia,
           fecha, created_by,
           transferencia_id, ubicacion_origen_id, observacion)
        VALUES
          (p_empresa_id, p_producto_id, v_producto_nombre, v_producto_sku,
           'SALIDA', p_cantidad, v_costo_unitario, 'transferencia', v_ref,
           now(), p_usuario_id,
           v_transferencia_id, p_ubic_origen_id, p_observacion);

        -- Movimiento ENTRADA (destino).
        INSERT INTO %I.movimientos_inventario
          (empresa_id, producto_id, producto_nombre, producto_sku,
           tipo, cantidad, costo_unitario, origen, referencia,
           fecha, created_by,
           transferencia_id, ubicacion_destino_id, observacion)
        VALUES
          (p_empresa_id, p_producto_id, v_producto_nombre, v_producto_sku,
           'ENTRADA', p_cantidad, v_costo_unitario, 'transferencia', v_ref,
           now(), p_usuario_id,
           v_transferencia_id, p_ubic_destino_id, p_observacion);

        RETURN v_transferencia_id;
      END
      $fn$;
    $f$, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch);
  END LOOP;
END
$mig$;
