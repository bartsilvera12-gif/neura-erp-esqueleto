-- =============================================================================
-- Comex · Gastos de importación: datos para el Libro de Compras
-- =============================================================================
-- El cliente (Living Room) necesita que los gastos de una importación que
-- LLEVAN IVA se registren además como factura en el Libro de Compras (con su
-- crédito fiscal y su cuenta contable), y que se pueda pagar cada uno con las
-- 3 formas (efectivo / transferencia / cuenta por pagar), descontando el saldo
-- real de la caja o el banco.
--
-- Para armar esa factura hacen falta el RUC y el timbrado del comprobante y el
-- porcentaje de IVA. `libro_compra_id` enlaza el gasto con la factura que se le
-- generó, para no duplicarla y para poder pagarla desde la pantalla de gastos.
--
-- Aditiva e idempotente. Solo esqueletoerp (la tabla comex_gastos existe solo
-- en este esquema).
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE esqueletoerp.comex_gastos
  ADD COLUMN IF NOT EXISTS proveedor_ruc   text,
  ADD COLUMN IF NOT EXISTS timbrado        text,
  ADD COLUMN IF NOT EXISTS iva_porcentaje  integer,
  ADD COLUMN IF NOT EXISTS libro_compra_id uuid
    REFERENCES esqueletoerp.libro_compras(id) ON DELETE SET NULL;

-- Solo 10% o 5% (o vacío cuando no lleva IVA).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comex_gastos_iva_pct_chk'
  ) THEN
    ALTER TABLE esqueletoerp.comex_gastos
      ADD CONSTRAINT comex_gastos_iva_pct_chk
      CHECK (iva_porcentaje IS NULL OR iva_porcentaje IN (5, 10));
  END IF;
END $$;

-- Para encontrar rápido el gasto a partir de su factura (y viceversa).
CREATE INDEX IF NOT EXISTS ix_comex_gastos_libro_compra
  ON esqueletoerp.comex_gastos(empresa_id, libro_compra_id)
  WHERE libro_compra_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
