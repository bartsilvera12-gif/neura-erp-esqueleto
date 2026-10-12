-- =============================================================================
-- Productos · NOMBRE DE IMPORTACION (doble nombre)
-- El cliente (Living Room) maneja dos nombres por producto:
--   * nombre              -> "Nombre del producto": el que ellos asignan, va a las
--                            proformas del CRM y a la factura del cliente (ya existe).
--   * nombre_importacion  -> el que da el proveedor; ligado a importaciones/exportaciones.
--
-- Solo esqueletoerp: la base es compartida con otros clientes y recorrer todos
-- los esquemas choca con su trafico (deadlock en saltatop.productos).
-- =============================================================================

SET lock_timeout = '5s';

ALTER TABLE esqueletoerp.productos
  ADD COLUMN IF NOT EXISTS nombre_importacion text;

NOTIFY pgrst, 'reload schema';
