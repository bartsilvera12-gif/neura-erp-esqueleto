-- =============================================================================
-- Producción de muebles · Fase 5a: órdenes de trabajo / cotizaciones de contratista
-- =============================================================================
-- Según la especificación (sección 5.7):
--   - prod_contratista_ordenes: cotización versionada por proyecto+contratista.
--     Modalidad global / por_unidad / mixta. Distingue importe solicitado,
--     aprobado, comprometido y pagado. Guarda importe_anterior y motivo del
--     cambio de versión. Una versión aprobada NO se edita: se crea otra.
--   - prod_contratista_orden_lineas: partidas (unidad / adicional / descuento),
--     con cantidad, precio unitario, subtotal y causa del adicional.
-- Solo esqueletoerp (Living Room). Idempotente.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

CREATE TABLE IF NOT EXISTS esqueletoerp.prod_contratista_ordenes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL,
  proyecto_id       uuid NOT NULL REFERENCES esqueletoerp.prod_proyectos(id) ON DELETE CASCADE,
  contratista_id    uuid REFERENCES esqueletoerp.prod_contratistas(id),
  contratista_nombre text,
  version           integer NOT NULL DEFAULT 1,
  modalidad         text NOT NULL DEFAULT 'global',     -- global | por_unidad | mixta
  estado            text NOT NULL DEFAULT 'borrador',   -- borrador | aprobada | rechazada
  importe_base      numeric NOT NULL DEFAULT 0,         -- importe del trabajo (modalidad global/mixta)
  importe_solicitado numeric NOT NULL DEFAULT 0,        -- total calculado
  importe_aprobado  numeric NOT NULL DEFAULT 0,
  importe_comprometido numeric NOT NULL DEFAULT 0,
  importe_pagado    numeric NOT NULL DEFAULT 0,
  importe_anterior  numeric,                            -- aprobado de la versión previa
  alcance           text,
  plazo             text,
  condiciones       text,
  exclusiones       text,
  motivo            text,                               -- motivo de la versión / cambio
  archivo_path      text,                               -- cotización original adjunta
  fecha             date NOT NULL DEFAULT current_date,
  created_by        uuid,
  created_by_nombre text,
  aprobado_por      text,
  aprobado_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prod_contratista_ordenes_uk
  ON esqueletoerp.prod_contratista_ordenes (proyecto_id, contratista_id, version);

CREATE TABLE IF NOT EXISTS esqueletoerp.prod_contratista_orden_lineas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL,
  orden_id          uuid NOT NULL REFERENCES esqueletoerp.prod_contratista_ordenes(id) ON DELETE CASCADE,
  tipo_partida      text NOT NULL DEFAULT 'unidad',     -- unidad | adicional | descuento
  descripcion       text NOT NULL,                      -- tipo de mueble / concepto
  cantidad          numeric NOT NULL DEFAULT 1,
  precio_unitario   numeric NOT NULL DEFAULT 0,
  subtotal          numeric NOT NULL DEFAULT 0,         -- descuento se guarda negativo
  causa             text,                               -- causa del adicional (ampliación, cambio de diseño, error, otra)
  observaciones     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMIT;

NOTIFY pgrst, 'reload schema';
