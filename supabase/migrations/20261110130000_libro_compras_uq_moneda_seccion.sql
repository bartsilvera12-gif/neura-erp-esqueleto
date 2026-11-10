-- =============================================================================
-- Libro de Compras · UNIQUE amplía con moneda + sección
-- =============================================================================
-- El UNIQUE anterior (empresa, tipo_codigo, ruc, timbrado, nro_comprobante)
-- impedía cargar una misma factura cuando convivía legítimamente en dos
-- secciones (Showroom PYG vs Comercio Exterior USD, por ejemplo).
-- Un mismo talonario puede facturar en distintas monedas y a distintas
-- secciones de la empresa.
--
-- La migración agrega `moneda` y `seccion` a la clave UNIQUE, en cada schema
-- que tenga `libro_compras`. Es idempotente: si el UNIQUE ampliado ya existe
-- no hace nada.
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
  idx_viejo text := 'libro_compras_comprobante_uq';
  idx_nuevo text := 'libro_compras_comprobante_v2_uq';
  tiene_seccion boolean;
  cols text;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'libro_compras' AND c.relkind = 'r'
  LOOP
    RAISE NOTICE '[libro_compras_uq_v2] schema=%', r.sch;

    -- ¿Este schema tiene la columna `seccion`? (Living Room sí, otros tenants no.)
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = r.sch AND table_name = 'libro_compras' AND column_name = 'seccion'
    ) INTO tiene_seccion;

    -- Columnas de la clave: siempre incluye moneda; agrega seccion sólo donde exista.
    IF tiene_seccion THEN
      cols := 'empresa_id, tipo_codigo, COALESCE(proveedor_ruc, proveedor_nombre), '
           || 'COALESCE(timbrado, ''''::text), nro_comprobante, moneda, seccion';
    ELSE
      cols := 'empresa_id, tipo_codigo, COALESCE(proveedor_ruc, proveedor_nombre), '
           || 'COALESCE(timbrado, ''''::text), nro_comprobante, moneda';
    END IF;

    -- 1) Crear el UNIQUE nuevo si aún no existe (incluye moneda + opcionalmente seccion).
    IF NOT EXISTS (
      SELECT 1 FROM pg_class ci
      JOIN pg_namespace ni ON ni.oid = ci.relnamespace
      WHERE ci.relname = idx_nuevo AND ni.nspname = r.sch
    ) THEN
      EXECUTE format(
        'CREATE UNIQUE INDEX %I ON %I.libro_compras (%s) WHERE (estado <> ''anulada''::text)',
        idx_nuevo, r.sch, cols
      );
    END IF;

    -- 2) Eliminar el UNIQUE viejo si existe (ya lo reemplaza el nuevo).
    IF EXISTS (
      SELECT 1 FROM pg_class ci
      JOIN pg_namespace ni ON ni.oid = ci.relnamespace
      WHERE ci.relname = idx_viejo AND ni.nspname = r.sch
    ) THEN
      EXECUTE format('DROP INDEX %I.%I', r.sch, idx_viejo);
    END IF;
  END LOOP;
END
$mig$;
