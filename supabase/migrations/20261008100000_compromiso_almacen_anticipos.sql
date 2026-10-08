-- =============================================================================
-- Circuito de ventas (PDF "Circuito al proceso de ventas")
-- =============================================================================
-- 1) El compromiso de venta dice de qué almacén sale la mercadería, y el control
--    de stock pasa a mirar ese almacén en vez del total de la empresa.
-- 2) Un compromiso puede cobrarse: el recibo de dinero queda atado a él, así se
--    sabe cuánto se anticipó y cuánto falta.
--
-- El recibo sigue siendo `origen = 'manual'` para no tocar el CHECK de la tabla;
-- lo que lo distingue es `presupuesto_id`.
--
-- Aditiva e idempotente. Solo esqueletoerp (base compartida).
-- =============================================================================

SET lock_timeout = '5s';

ALTER TABLE esqueletoerp.presupuestos
  ADD COLUMN IF NOT EXISTS ubicacion_id uuid;

COMMENT ON COLUMN esqueletoerp.presupuestos.ubicacion_id IS
  'Almacén del que sale la mercadería comprometida; contra él se controla el stock.';

ALTER TABLE esqueletoerp.recibos_dinero
  ADD COLUMN IF NOT EXISTS presupuesto_id uuid;

CREATE INDEX IF NOT EXISTS ix_recibos_dinero_presupuesto
  ON esqueletoerp.recibos_dinero(empresa_id, presupuesto_id);

NOTIFY pgrst, 'reload schema';
