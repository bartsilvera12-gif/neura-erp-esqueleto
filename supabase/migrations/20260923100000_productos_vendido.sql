-- =============================================================================
-- Productos · VENDIDO (Excel "INVENTARIO DE STOCK ASUNCION PARAGUAY")
-- En el Excel de Living Room VENDIDO se carga a mano y
-- SALDO FINAL = CANTIDAD DE IMPORTACION − VENDIDO − EXPORTACION BOLIVIA.
--
-- Solo esqueletoerp: la base es compartida con otros clientes y recorrer todos
-- los esquemas choca con su tráfico (deadlock en saltatop.productos).
-- =============================================================================

SET lock_timeout = '5s';

ALTER TABLE esqueletoerp.productos
  ADD COLUMN IF NOT EXISTS vendido numeric NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
