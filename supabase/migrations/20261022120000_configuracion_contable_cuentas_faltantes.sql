-- =============================================================================
-- Configuración contable · Columnas de cuentas faltantes
-- =============================================================================
-- Al cerrar una importación (y en los asientos de venta) el código lee la
-- configuración contable y esperaba columnas que no existían en esqueletoerp:
--   cuenta_ventas_exentas_id, cuenta_ventas_servicios_id, cuenta_clientes_id,
--   cuenta_anticipos_clientes_id.
-- Eso rompía con: column "cuenta_ventas_exentas_id" does not exist.
--
-- Son cuentas del plan de cuentas (uuid, FK → plan_cuentas, nullable). Solo
-- esqueletoerp (Living Room). Nullable → no afecta datos previos.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE esqueletoerp.configuracion_contable
  ADD COLUMN IF NOT EXISTS cuenta_ventas_exentas_id uuid
    REFERENCES esqueletoerp.plan_cuentas(id) ON DELETE SET NULL;

ALTER TABLE esqueletoerp.configuracion_contable
  ADD COLUMN IF NOT EXISTS cuenta_ventas_servicios_id uuid
    REFERENCES esqueletoerp.plan_cuentas(id) ON DELETE SET NULL;

ALTER TABLE esqueletoerp.configuracion_contable
  ADD COLUMN IF NOT EXISTS cuenta_clientes_id uuid
    REFERENCES esqueletoerp.plan_cuentas(id) ON DELETE SET NULL;

ALTER TABLE esqueletoerp.configuracion_contable
  ADD COLUMN IF NOT EXISTS cuenta_anticipos_clientes_id uuid
    REFERENCES esqueletoerp.plan_cuentas(id) ON DELETE SET NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Faltaba también cuenta_descuentos_incobrables_id (el SELECT de getConfigContable la pide).
BEGIN;
ALTER TABLE esqueletoerp.configuracion_contable
  ADD COLUMN IF NOT EXISTS cuenta_descuentos_incobrables_id uuid
    REFERENCES esqueletoerp.plan_cuentas(id) ON DELETE SET NULL;
COMMIT;
NOTIFY pgrst, 'reload schema';
