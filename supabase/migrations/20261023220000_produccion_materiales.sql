-- =============================================================================
-- Producción de muebles · Lista de materiales del proyecto + conciliación
-- =============================================================================
-- El cliente quiere "jalar" herrajes/tableros del catálogo al crear el proyecto
-- y poner la cantidad que se va a usar (cantidad requerida). Con eso el sistema
-- concilia requerido vs reservado/entregado/devuelto/consumido (spec 5.6).
--   - prod_proyecto_materiales: lista de materiales (BOM) requeridos por proyecto.
-- Solo esqueletoerp (Living Room). Idempotente.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

CREATE TABLE IF NOT EXISTS esqueletoerp.prod_proyecto_materiales (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL,
  proyecto_id        uuid NOT NULL REFERENCES esqueletoerp.prod_proyectos(id) ON DELETE CASCADE,
  articulo_tipo      text NOT NULL,                      -- herraje | tablero
  articulo_id        uuid NOT NULL,
  descripcion        text,
  unidad             text,
  cantidad_requerida numeric NOT NULL DEFAULT 0,
  observaciones      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prod_proyecto_materiales_idx
  ON esqueletoerp.prod_proyecto_materiales (empresa_id, proyecto_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
