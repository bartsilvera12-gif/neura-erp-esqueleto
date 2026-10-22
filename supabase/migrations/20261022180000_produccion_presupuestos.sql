-- =============================================================================
-- Producción de muebles · Fase 3: presupuesto versionado del proyecto
-- =============================================================================
-- Según la especificación (5.3, 5.7, 5.9, modelo de datos, algoritmo 8.1):
--   - prod_presupuestos: cabecera versionada por proyecto (borrador / en_revision
--     / aprobada). Las versiones aprobadas no se editan: se crea una nueva.
--   - prod_presupuesto_lineas: líneas por tipo de costo (tablero, herraje,
--     contratista, otro), con cantidad, costo unitario y subtotal.
-- Solo esqueletoerp (Living Room). Idempotente.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

CREATE TABLE IF NOT EXISTS esqueletoerp.prod_presupuestos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL,
  proyecto_id     uuid NOT NULL REFERENCES esqueletoerp.prod_proyectos(id) ON DELETE CASCADE,
  version         integer NOT NULL DEFAULT 1,
  estado          text NOT NULL DEFAULT 'borrador',   -- borrador | en_revision | aprobada | rechazada
  fecha           date NOT NULL DEFAULT current_date,
  total           numeric NOT NULL DEFAULT 0,
  observaciones   text,
  created_by      uuid,
  created_by_nombre text,
  aprobado_por    text,
  aprobado_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prod_presupuestos_proyecto_version_uk
  ON esqueletoerp.prod_presupuestos (proyecto_id, version);

CREATE TABLE IF NOT EXISTS esqueletoerp.prod_presupuesto_lineas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL,
  presupuesto_id  uuid NOT NULL REFERENCES esqueletoerp.prod_presupuestos(id) ON DELETE CASCADE,
  tipo_costo      text NOT NULL DEFAULT 'otro',        -- tablero | herraje | contratista | otro
  articulo_id     uuid,                                -- id del tablero/herraje/contratista (opcional)
  descripcion     text NOT NULL,
  unidad          text,
  cantidad        numeric NOT NULL DEFAULT 1,
  costo_unitario  numeric NOT NULL DEFAULT 0,
  subtotal        numeric NOT NULL DEFAULT 0,
  observaciones   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMIT;

NOTIFY pgrst, 'reload schema';
