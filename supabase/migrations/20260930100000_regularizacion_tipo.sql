-- Regularización: tipo de la factura a regularizar (local o de exportación).
-- Solo esqueletoerp. Aditiva e idempotente.
SET lock_timeout = '5s';

ALTER TABLE esqueletoerp.facturas_regularizacion ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE esqueletoerp.facturas_regularizacion DROP CONSTRAINT IF EXISTS facturas_regularizacion_tipo_check;
ALTER TABLE esqueletoerp.facturas_regularizacion
  ADD CONSTRAINT facturas_regularizacion_tipo_check CHECK (tipo IS NULL OR tipo IN ('LOCAL','EXPORTACION'));

NOTIFY pgrst, 'reload schema';
