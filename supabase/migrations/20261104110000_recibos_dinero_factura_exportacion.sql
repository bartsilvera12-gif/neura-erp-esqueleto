-- =============================================================================
-- Recibos de dinero · Ligar a facturas electrónicas (facturas_exportacion)
-- =============================================================================
-- La clienta pide: "los pagos son a las facturas y no a los presupuestos". Esta
-- migración agrega `factura_exportacion_id` a `recibos_dinero` (nullable,
-- coexiste con `presupuesto_id`). Un recibo puede estar ligado a una factura
-- SIFEN concreta, lo que permite:
--   - desde la factura ver sus cobros
--   - desde el listado de cobros filtrar facturas con saldo pendiente.
--
-- Aditiva, idempotente, no toca recibos existentes (quedan con presupuesto_id).
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
BEGIN
  -- Solo schemas que tengan AMBAS tablas (recibos_dinero + facturas_exportacion).
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_namespace n
    WHERE EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = n.oid AND c.relname = 'recibos_dinero' AND c.relkind = 'r')
      AND EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = n.oid AND c.relname = 'facturas_exportacion' AND c.relkind = 'r')
  LOOP
    RAISE NOTICE '[recibos_dinero_factura] schema=%', r.sch;
    EXECUTE format(
      'ALTER TABLE %I.recibos_dinero ADD COLUMN IF NOT EXISTS factura_exportacion_id uuid REFERENCES %I.facturas_exportacion(id) ON DELETE SET NULL',
      r.sch, r.sch
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS ix_recibos_dinero_factura_exp ON %I.recibos_dinero(factura_exportacion_id) WHERE factura_exportacion_id IS NOT NULL',
      r.sch
    );
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
