-- =============================================================================
-- CRM · Prospectos: empresa y servicio nullable
-- =============================================================================
-- La clienta pide poder crear prospectos SIN cargar la empresa (solo nombre)
-- y sin seleccionar un "servicio/plan" (ellos no venden planes, venden
-- productos sueltos y después hacen presupuestos). Las columnas `empresa` y
-- `servicio` eran NOT NULL — se relajan a nullable para permitir el flujo.
--
-- Migración aditiva: solo quita NOT NULL, no toca datos existentes.
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'crm_prospectos' AND c.relkind = 'r'
  LOOP
    RAISE NOTICE '[crm_prospectos_nullable] schema=%', r.sch;
    EXECUTE format('ALTER TABLE %I.crm_prospectos ALTER COLUMN empresa DROP NOT NULL', r.sch);
    EXECUTE format('ALTER TABLE %I.crm_prospectos ALTER COLUMN servicio DROP NOT NULL', r.sch);
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
