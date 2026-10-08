-- =============================================================================
-- Comercio Exterior · Costo real de la mercadería importada
-- =============================================================================
-- Los gastos de la importación (flete, seguro, despachante, tributos…) se
-- reparten entre los productos para saber cuánto costó de verdad cada unidad
-- puesta en el depósito, no solo lo que facturó el proveedor.
--
--   importaciones.prorrateo_gastos   cómo se reparte: por valor o por cantidad
--   importacion_items.costo_final_gs costo unitario en guaraníes ya con gastos
--   importacion_items.costo_aplicado_at  cuándo se pasó ese costo al inventario
--   comex_gastos.cuenta_codigo       cuenta del plan de cuentas, para contabilidad
--
-- Aditiva e idempotente. No toca stock ni importes de ningún documento.
-- =============================================================================

SET lock_timeout = '5s';

ALTER TABLE esqueletoerp.importaciones
  ADD COLUMN IF NOT EXISTS prorrateo_gastos text NOT NULL DEFAULT 'valor';

DO $$
BEGIN
  ALTER TABLE esqueletoerp.importaciones
    ADD CONSTRAINT importaciones_prorrateo_check CHECK (prorrateo_gastos IN ('valor','cantidad'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE esqueletoerp.importacion_items
  ADD COLUMN IF NOT EXISTS costo_final_gs    numeric,
  ADD COLUMN IF NOT EXISTS costo_aplicado_at timestamptz;

ALTER TABLE esqueletoerp.comex_gastos
  ADD COLUMN IF NOT EXISTS cuenta_codigo text;

COMMENT ON COLUMN esqueletoerp.importacion_items.costo_final_gs IS
  'Costo unitario en Gs. con los gastos de la importación ya prorrateados.';

NOTIFY pgrst, 'reload schema';
