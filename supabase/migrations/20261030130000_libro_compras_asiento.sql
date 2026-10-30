-- Contabilización automática de las compras del Libro de Compras: cada
-- comprobante registra su asiento en Contabilidad y guarda acá el id del asiento
-- generado (para no duplicar y para que el PDF muestre "registrado" + número).
BEGIN;

ALTER TABLE esqueletoerp.libro_compras
  ADD COLUMN IF NOT EXISTS asiento_contable_id uuid;

COMMIT;

NOTIFY pgrst, 'reload schema';
