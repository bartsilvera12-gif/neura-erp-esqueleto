-- =============================================================================
-- Empresas · Columnas Paraguay para nómina (snapshot en recibos)
-- =============================================================================
-- La API de recibos (src/app/api/rrhh/nomina/recibos/route.ts) selecciona
-- `nombre_empresa, ruc, ips_patronal, centro_trabajo_direccion` para capturar
-- el snapshot que queda guardado en cada recibo. La tabla `empresas` nunca
-- tuvo esas tres columnas, por lo que crear un recibo fallaba con
-- `column empresas.ips_patronal does not exist`.
--
-- Esta migración:
--   - Agrega `ruc`, `ips_patronal`, `centro_trabajo_direccion` a `empresas`
--     en todo schema que tenga esa tabla (public + tenants).
--   - Es ADITIVA e IDEMPOTENTE: usa ADD COLUMN IF NOT EXISTS, no borra ni
--     altera columnas existentes, no toca datos.
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
  LOOP
    RAISE NOTICE '[empresas_paraguay_ips] schema=%', r.sch;

    EXECUTE format('ALTER TABLE %I.empresas ADD COLUMN IF NOT EXISTS ruc text', r.sch);
    EXECUTE format('ALTER TABLE %I.empresas ADD COLUMN IF NOT EXISTS ips_patronal text', r.sch);
    EXECUTE format('ALTER TABLE %I.empresas ADD COLUMN IF NOT EXISTS centro_trabajo_direccion text', r.sch);
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
