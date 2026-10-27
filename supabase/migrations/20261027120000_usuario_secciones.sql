-- =============================================================================
-- Permisos por sub-sección (pantalla) dentro de un módulo, por usuario
-- =============================================================================
-- Hoy el acceso es por módulo (usuario_modulos). Esta tabla permite, desde el
-- panel de administrador, limitar un usuario a sub-secciones específicas de un
-- módulo (ej: darle "Órdenes de compra" sin "Proveedores").
--
-- Semántica (compatible hacia atrás):
--   - Si un usuario tiene el módulo y NO tiene filas acá para ese módulo →
--     ve TODAS las sub-secciones (comportamiento actual).
--   - Si tiene filas para ese módulo → ve SOLO esas sub-secciones.
-- `seccion` guarda el href de la sub-sección (estable y único en el menú).
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

CREATE TABLE IF NOT EXISTS esqueletoerp.usuario_secciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES esqueletoerp.usuarios(id) ON DELETE CASCADE,
  modulo_id   uuid NOT NULL REFERENCES esqueletoerp.modulos(id) ON DELETE CASCADE,
  seccion     text NOT NULL,     -- href de la sub-sección (ej: /compras/ordenes)
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS usuario_secciones_uk
  ON esqueletoerp.usuario_secciones (usuario_id, modulo_id, seccion);
CREATE INDEX IF NOT EXISTS usuario_secciones_usuario_idx
  ON esqueletoerp.usuario_secciones (usuario_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
