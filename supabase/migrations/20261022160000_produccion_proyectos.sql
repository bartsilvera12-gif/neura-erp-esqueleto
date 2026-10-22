-- =============================================================================
-- Producción de muebles · Fase 2: proyectos de producción
-- =============================================================================
-- Según la especificación del cliente (5.1, 4 estados y modelo de datos):
--   - prod_proyectos: proyecto de fabricación (código PRJ-AAAA-0001, cliente,
--     ubicación, fechas, responsables, prioridad, estado).
--   - prod_proyecto_muebles: muebles/partidas dentro del proyecto.
--   - prod_proyecto_archivos: adjuntos (planos, imágenes, documentos).
-- Solo esqueletoerp (Living Room). Idempotente.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

CREATE TABLE IF NOT EXISTS esqueletoerp.prod_proyectos (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              uuid NOT NULL,
  codigo                  text NOT NULL,
  nombre                  text NOT NULL,
  cliente_id              uuid REFERENCES esqueletoerp.clientes(id) ON DELETE SET NULL,
  cliente_nombre          text,
  ubicacion               text,
  fecha_pedido            date,
  fecha_entrega_prevista  date,
  responsable_diseno      text,
  responsable_produccion  text,
  prioridad               text NOT NULL DEFAULT 'media',   -- alta | media | baja
  estado                  text NOT NULL DEFAULT 'borrador',-- ver ciclo de vida (sección 4)
  observaciones           text,
  created_by              uuid,
  created_by_nombre       text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prod_proyectos_empresa_codigo_uk
  ON esqueletoerp.prod_proyectos (empresa_id, upper(btrim(codigo)));

CREATE TABLE IF NOT EXISTS esqueletoerp.prod_proyecto_muebles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL,
  proyecto_id   uuid NOT NULL REFERENCES esqueletoerp.prod_proyectos(id) ON DELETE CASCADE,
  codigo        text,
  descripcion   text NOT NULL,
  cantidad      numeric NOT NULL DEFAULT 1,
  estado        text NOT NULL DEFAULT 'pendiente',
  observaciones text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS esqueletoerp.prod_proyecto_archivos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL,
  proyecto_id   uuid NOT NULL REFERENCES esqueletoerp.prod_proyectos(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  storage_path  text NOT NULL,
  tipo          text,
  created_by_nombre text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMIT;

NOTIFY pgrst, 'reload schema';
