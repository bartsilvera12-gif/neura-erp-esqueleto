-- =============================================================================
-- Facturas de exportación · formato excepcional "Aduanas"
-- =============================================================================
-- Cuatro facturas ya emitidas se presentaron ante Aduanas con un formato que no
-- lleva la columna UNIDAD ni el código del artículo. Para que la reimpresión
-- coincida con el papel presentado, esas facturas se marcan una por una con
-- `formato_aduana`; el resto (y todas las futuras) siguen imprimiéndose igual.
--
-- No cambia importes, numeración ni estados: es solo formato de impresión.
-- Aditiva e idempotente. Solo esqueletoerp (base compartida).
-- =============================================================================

SET lock_timeout = '5s';

ALTER TABLE esqueletoerp.facturas_exportacion
  ADD COLUMN IF NOT EXISTS formato_aduana boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN esqueletoerp.facturas_exportacion.formato_aduana IS
  'Solo impresión: sin columna UNIDAD y sin código de artículo, como el papel presentado ante Aduanas.';

NOTIFY pgrst, 'reload schema';
