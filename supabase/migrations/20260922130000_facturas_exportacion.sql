-- =============================================================================
-- Facturas de Exportación (Living Room)
-- =============================================================================
-- Módulo nuevo: emitir facturas de exportación con Autoimpresor
-- (timbrado 19025402, puntos 004/005, vigencia 03/08/2026 – 31/08/2027).
--
-- Correlativo atómico por punto de expedición: RPC dedicada bloquea la fila
-- de configuración y devuelve el siguiente número. Nunca hay huecos ni
-- duplicados aunque emitan dos usuarios a la vez.
--
-- Idempotente + aditivo. Ejecuta por cada tenant que tenga schema propio.
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_namespace n
    WHERE n.nspname NOT IN ('pg_catalog','information_schema','public','auth','storage','extensions','graphql','graphql_public','realtime','pgrst','pgbouncer','vault','net')
      AND EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = n.oid AND c.relname = 'empresas' AND c.relkind = 'r')
  LOOP
    RAISE NOTICE '[facturas_exportacion] schema=%', r.sch;

    -- Configuración de puntos de expedición (Autoimpresor).
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.facturas_exportacion_config (
        id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id           uuid NOT NULL,
        establecimiento      text NOT NULL,
        punto_expedicion     text NOT NULL,
        timbrado             text NOT NULL,
        vigencia_desde       date NOT NULL,
        vigencia_hasta       date NOT NULL,
        rango_desde          integer NOT NULL DEFAULT 1,
        rango_hasta          integer NOT NULL DEFAULT 9999999,
        proximo_numero       integer NOT NULL DEFAULT 1,
        activo               boolean NOT NULL DEFAULT true,
        created_at           timestamptz NOT NULL DEFAULT now(),
        updated_at           timestamptz NOT NULL DEFAULT now(),
        UNIQUE (empresa_id, establecimiento, punto_expedicion, timbrado)
      )
    $f$, r.sch);

    -- Cabecera de factura de exportación.
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.facturas_exportacion (
        id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id           uuid NOT NULL,
        establecimiento      text NOT NULL,
        punto_expedicion     text NOT NULL,
        timbrado             text NOT NULL,
        numero               integer NOT NULL,
        numero_formateado    text GENERATED ALWAYS AS (
          establecimiento || '-' || punto_expedicion || '-' || lpad(numero::text, 7, '0')
        ) STORED,
        fecha                date NOT NULL DEFAULT CURRENT_DATE,
        moneda               text NOT NULL DEFAULT 'USD',
        tipo_cambio          numeric NOT NULL DEFAULT 1,
        cliente_nombre       text NOT NULL,
        cliente_documento    text,
        cliente_direccion    text,
        cliente_pais         text NOT NULL DEFAULT 'BOLIVIA',
        subtotal             numeric NOT NULL DEFAULT 0,
        total                numeric NOT NULL DEFAULT 0,
        observaciones        text,
        estado               text NOT NULL DEFAULT 'EMITIDA' CHECK (estado IN ('EMITIDA','ANULADA')),
        motivo_anulacion     text,
        anulada_at           timestamptz,
        anulada_por          uuid,
        anulada_por_nombre   text,
        regularizacion       boolean NOT NULL DEFAULT false,
        created_at           timestamptz NOT NULL DEFAULT now(),
        created_by           uuid,
        created_by_nombre    text,
        updated_at           timestamptz NOT NULL DEFAULT now(),
        UNIQUE (empresa_id, establecimiento, punto_expedicion, timbrado, numero)
      )
    $f$, r.sch);

    EXECUTE format($f$
      CREATE INDEX IF NOT EXISTS facturas_exportacion_empresa_fecha_idx
        ON %I.facturas_exportacion (empresa_id, fecha DESC)
    $f$, r.sch);

    -- Items.
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.facturas_exportacion_items (
        id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id           uuid NOT NULL,
        factura_id           uuid NOT NULL REFERENCES %I.facturas_exportacion(id) ON DELETE CASCADE,
        producto_id          uuid,
        descripcion          text NOT NULL,
        cantidad             numeric NOT NULL,
        precio_unitario      numeric NOT NULL,
        subtotal             numeric NOT NULL,
        orden                integer NOT NULL DEFAULT 0
      )
    $f$, r.sch, r.sch);

    EXECUTE format($f$
      CREATE INDEX IF NOT EXISTS facturas_exportacion_items_factura_idx
        ON %I.facturas_exportacion_items (factura_id)
    $f$, r.sch);

    -- Auditoría.
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.facturas_exportacion_auditoria (
        id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id           uuid NOT NULL,
        factura_id           uuid,
        accion               text NOT NULL,
        detalle              jsonb,
        usuario_id           uuid,
        usuario_nombre       text,
        created_at           timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch);

    -- RPC: reservar correlativo atómico.
    EXECUTE format($f$
      CREATE OR REPLACE FUNCTION %I.reservar_correlativo_factura_exportacion(
        p_empresa_id uuid,
        p_establecimiento text,
        p_punto_expedicion text,
        p_timbrado text
      ) RETURNS integer
      LANGUAGE plpgsql
      AS $fn$
      DECLARE
        v_numero integer;
      BEGIN
        UPDATE %I.facturas_exportacion_config
          SET proximo_numero = proximo_numero + 1,
              updated_at = now()
          WHERE empresa_id = p_empresa_id
            AND establecimiento = p_establecimiento
            AND punto_expedicion = p_punto_expedicion
            AND timbrado = p_timbrado
            AND activo = true
          RETURNING proximo_numero - 1 INTO v_numero;

        IF v_numero IS NULL THEN
          RAISE EXCEPTION 'No hay configuración Autoimpresor activa para % / % / %',
            p_establecimiento, p_punto_expedicion, p_timbrado
            USING ERRCODE = 'P0002';
        END IF;

        RETURN v_numero;
      END
      $fn$
    $f$, r.sch, r.sch);
  END LOOP;
END
$mig$;

-- Alta del módulo en el catálogo (solo si la tabla existe en el schema esqueletoerp).
DO $cat$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='esqueletoerp' AND c.relname='modulos') THEN
    INSERT INTO esqueletoerp.modulos (slug, nombre, descripcion)
    VALUES ('facturas_exportacion', 'Facturas de Exportación', 'Emisión de facturas de exportación con Autoimpresor timbrado y correlativo atómico.')
    ON CONFLICT (slug) DO UPDATE SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion;

    -- Activar para la empresa de Living Room.
    INSERT INTO esqueletoerp.empresa_modulos (empresa_id, modulo_id, activo)
    SELECT '3c14fe00-d466-4f24-a010-1bbd7e37ccd6', m.id, true
    FROM esqueletoerp.modulos m
    WHERE m.slug = 'facturas_exportacion'
    ON CONFLICT (empresa_id, modulo_id) DO UPDATE SET activo = true;
  END IF;
END
$cat$;

-- Seed de configuración Autoimpresor Living Room (dos puntos: 004 y 005).
DO $seed$
DECLARE
  v_empresa uuid := '3c14fe00-d466-4f24-a010-1bbd7e37ccd6';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='esqueletoerp' AND c.relname='facturas_exportacion_config') THEN
    INSERT INTO esqueletoerp.facturas_exportacion_config
      (empresa_id, establecimiento, punto_expedicion, timbrado, vigencia_desde, vigencia_hasta, rango_desde, rango_hasta, proximo_numero, activo)
    VALUES
      (v_empresa, '001', '004', '19025402', DATE '2026-08-03', DATE '2027-08-31', 1, 9999999, 1, true),
      (v_empresa, '001', '005', '19025402', DATE '2026-08-03', DATE '2027-08-31', 1, 9999999, 1, true)
    ON CONFLICT (empresa_id, establecimiento, punto_expedicion, timbrado) DO NOTHING;
  END IF;
END
$seed$;

NOTIFY pgrst, 'reload schema';
