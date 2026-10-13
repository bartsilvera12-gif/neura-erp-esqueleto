-- =============================================================================
-- Comex · Gastos de importación: marca "lleva IVA (10%)"
-- El cliente (Living Room) necesita que, en los gastos/facturas de una
-- importación, se distinga el COSTO del PAGO cuando el gasto lleva IVA:
--   * monto del gasto   = 100% con IVA  -> es el PAGO (caja / libro de compras).
--   * costo (al costeo)  = 90% sin IVA  -> lo que se capitaliza en el producto.
-- El flag es por gasto (apagado por defecto = comportamiento actual).
--
-- Solo esqueletoerp (la tabla comex_gastos existe solo en este esquema).
-- =============================================================================

SET lock_timeout = '5s';

ALTER TABLE esqueletoerp.comex_gastos
  ADD COLUMN IF NOT EXISTS lleva_iva boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
