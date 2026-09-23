-- =============================================================================
-- Clientes · campos de facturación (portado de Ferrecolor). Solo esqueletoerp.
--   nombre_facturacion -> nombre alternativo para la factura (NULL = razón social / contacto)
--   nivel_precio       -> minorista | mayorista | distribuidor
--   es_contribuyente   -> persona inscripta en la SET
--   usa_nota_remision  -> genera nota de remisión al venderle
-- Aditiva e idempotente.
-- =============================================================================

SET lock_timeout = '5s';

ALTER TABLE esqueletoerp.clientes
  ADD COLUMN IF NOT EXISTS nombre_facturacion text,
  ADD COLUMN IF NOT EXISTS nivel_precio text NOT NULL DEFAULT 'minorista'
    CHECK (nivel_precio IN ('minorista','mayorista','distribuidor')),
  ADD COLUMN IF NOT EXISTS es_contribuyente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS usa_nota_remision boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
