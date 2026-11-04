-- =============================================================================
-- Pagos de compras · origen "CUENTA_CONTABLE" (inter-empresa, saldo acumulado)
-- =============================================================================
-- La clienta pide poder pagar una compra desde una cuenta contable arbitraria
-- (no solo banco / caja chica) para casos donde tienen saldo acumulado con
-- otra empresa relacionada. Esto agrega el campo `cuenta_contable_id` a
-- `libro_compras_pagos` y amplia el check de `medio` para aceptar el nuevo
-- valor "CUENTA_CONTABLE".
--
-- Migracion aditiva: solo agrega columna nullable y recrea el check. No toca
-- pagos existentes.
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'libro_compras_pagos' AND c.relkind = 'r'
  LOOP
    RAISE NOTICE '[pago_cuenta_contable] schema=%', r.sch;
    -- Columna FK a plan_cuentas (nullable: solo se llena cuando medio='CUENTA_CONTABLE').
    EXECUTE format(
      'ALTER TABLE %I.libro_compras_pagos ADD COLUMN IF NOT EXISTS cuenta_contable_id uuid REFERENCES %I.plan_cuentas(id) ON DELETE RESTRICT',
      r.sch, r.sch
    );
    -- Recrear check de `medio` para aceptar CUENTA_CONTABLE.
    EXECUTE format('ALTER TABLE %I.libro_compras_pagos DROP CONSTRAINT IF EXISTS libro_compras_pagos_medio_check', r.sch);
    EXECUTE format($$ALTER TABLE %I.libro_compras_pagos ADD CONSTRAINT libro_compras_pagos_medio_check CHECK (medio IN ('BANCO','CAJA_CHICA','CUENTA_CONTABLE'))$$, r.sch);
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
