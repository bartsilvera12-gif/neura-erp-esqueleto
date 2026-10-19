-- =============================================================================
-- Contabilidad · Asiento automático de Importación (al cerrar)
-- =============================================================================
-- Cuando una importación pasa a "Cerrada" se genera su asiento contable,
-- capitalizando el costo en el inventario:
--
--   DEBE   Inventario / Mercadería        (mercadería + gastos sin IVA)
--   DEBE   IVA Crédito 10%                (IVA de los gastos que lo llevan)
--   HABER  Proveedor del exterior         (valor de la mercadería)
--   HABER  Gastos por pagar               (cada gasto con su cuenta, 100% c/IVA)
--
-- Cambios de esquema (solo esqueletoerp: importaciones y contabilidad viven acá):
--   1) configuracion_contable: nueva cuenta_inventario_id (FK plan_cuentas).
--   2) asientos_contables.origen_tipo: se amplía el CHECK para permitir
--      'importacion'.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

-- 1) Cuenta de Inventario / Mercadería para capitalizar el costo.
ALTER TABLE esqueletoerp.configuracion_contable
  ADD COLUMN IF NOT EXISTS cuenta_inventario_id uuid
    REFERENCES esqueletoerp.plan_cuentas(id) ON DELETE SET NULL;

-- 2) Permitir el nuevo origen de asiento 'importacion'.
ALTER TABLE esqueletoerp.asientos_contables
  DROP CONSTRAINT IF EXISTS asientos_contables_origen_tipo_check;

ALTER TABLE esqueletoerp.asientos_contables
  ADD CONSTRAINT asientos_contables_origen_tipo_check
  CHECK (origen_tipo IN ('gasto_servicio','compra','reversion','pago_proveedor',
                         'factura_venta','nota_credito_venta','cobro_cliente',
                         'reclasificacion_anticipo','condonacion','importacion'));

COMMIT;

NOTIFY pgrst, 'reload schema';
