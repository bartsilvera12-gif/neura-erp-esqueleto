-- Nota de crédito de compras vinculada al comprobante que corrige.
-- Solo esqueletoerp. Aditiva e idempotente.
SET lock_timeout = '5s';

ALTER TABLE esqueletoerp.libro_compras
  ADD COLUMN IF NOT EXISTS nota_credito_de_id uuid REFERENCES esqueletoerp.libro_compras(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_lc_nc_de ON esqueletoerp.libro_compras(empresa_id, nota_credito_de_id);

NOTIFY pgrst, 'reload schema';
