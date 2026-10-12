-- =============================================================================
-- Inventario · BACKFILL del stock por depósito (Fase 4 — paso seguro)
-- Hasta ahora el stock vivía solo como total en productos.stock_actual y el
-- desglose por depósito (inventario_stock_ubicacion) estaba casi vacío.
-- Este backfill deja el stock actual asignado a un almacén concreto, para que
-- el "stock por almacén" y sus reportes tengan datos reales:
--   1) a los productos sin depósito principal se les asigna el predeterminado
--      ("Almacén Mariano Roque");
--   2) se crea una fila de stock por depósito (principal) con el stock actual
--      para los productos que todavía no tienen ninguna.
-- Es aditivo: no cambia el total (productos.stock_actual) ni toca ventas/compras.
--
-- Solo esqueletoerp (base compartida con otros clientes).
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

-- 1) Depósito principal = predeterminado para los productos que no tienen uno.
UPDATE esqueletoerp.productos p
   SET ubicacion_principal_id = d.id,
       updated_at = now()
  FROM esqueletoerp.inventario_ubicaciones d
 WHERE p.ubicacion_principal_id IS NULL
   AND d.empresa_id = p.empresa_id
   AND d.es_predeterminado = true
   AND d.activo = true;

-- 2) Fila de stock por depósito (principal) con el stock actual, para los
--    productos que aún no tienen ninguna fila por depósito.
INSERT INTO esqueletoerp.inventario_stock_ubicacion
  (empresa_id, producto_id, ubicacion_id, stock_actual, es_principal)
SELECT p.empresa_id, p.id, p.ubicacion_principal_id, p.stock_actual, true
  FROM esqueletoerp.productos p
 WHERE p.ubicacion_principal_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM esqueletoerp.inventario_stock_ubicacion s
      WHERE s.empresa_id = p.empresa_id AND s.producto_id = p.id
   );

COMMIT;

NOTIFY pgrst, 'reload schema';
