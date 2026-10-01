-- La factura local y la venta de mostrador son el mismo hecho: se vinculan.
-- Solo esqueletoerp. Aditiva e idempotente.
SET lock_timeout = '5s';

ALTER TABLE esqueletoerp.facturas_exportacion ADD COLUMN IF NOT EXISTS venta_id uuid;

-- Una venta tiene como mucho una factura vigente (anulada no cuenta).
CREATE UNIQUE INDEX IF NOT EXISTS facturas_exportacion_venta_uq
  ON esqueletoerp.facturas_exportacion(venta_id)
  WHERE venta_id IS NOT NULL AND estado <> 'ANULADA';

NOTIFY pgrst, 'reload schema';
