-- =============================================================================
-- Comercio Exterior · Importaciones v2 (PDF "Comercio Exterior, Inventario y
-- Control Operativo" §3, §4, §8, §9). Solo esqueletoerp (base compartida).
--
--   importaciones          + responsable, motivo de anulación, creado por
--   importacion_items      + contenedor_id
--   comex_contenedores     contenedores de importación / exportación con estado
--   importacion_seriales   seriales por ítem (únicos por empresa)
--   importacion_recepciones / _items   lo que realmente llegó
--   comex_incidencias      inconsistencias con responsable y estados
--   comex_historial        quién hizo qué, con valor anterior y nuevo
--   comex_adjuntos         documentos (bucket comex-adjuntos, lo crea la app)
--
-- Aditiva e idempotente. No toca stock.
-- =============================================================================

SET lock_timeout = '5s';

ALTER TABLE esqueletoerp.importaciones
  ADD COLUMN IF NOT EXISTS responsable_id     uuid,
  ADD COLUMN IF NOT EXISTS responsable_nombre text,
  ADD COLUMN IF NOT EXISTS anulada_motivo     text,
  ADD COLUMN IF NOT EXISTS created_by_nombre  text;

CREATE TABLE IF NOT EXISTS esqueletoerp.comex_contenedores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  numero          text NOT NULL,
  tipo_operacion  text NOT NULL CHECK (tipo_operacion IN ('IMPORTACION','EXPORTACION')),
  importacion_id  uuid REFERENCES esqueletoerp.importaciones(id) ON DELETE CASCADE,
  exportacion_id  uuid,
  estado          text NOT NULL DEFAULT 'en_preparacion'
                  CHECK (estado IN ('en_preparacion','confirmado','en_transito','arribado','en_revision','recibido','cerrado')),
  naviera         text,
  fecha_prevista  date,
  fecha_real      date,
  observaciones   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_comex_cont_importacion ON esqueletoerp.comex_contenedores(importacion_id);
CREATE INDEX IF NOT EXISTS ix_comex_cont_empresa_estado ON esqueletoerp.comex_contenedores(empresa_id, estado);

ALTER TABLE esqueletoerp.importacion_items
  ADD COLUMN IF NOT EXISTS contenedor_id uuid REFERENCES esqueletoerp.comex_contenedores(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS esqueletoerp.importacion_seriales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  importacion_id  uuid NOT NULL REFERENCES esqueletoerp.importaciones(id) ON DELETE CASCADE,
  item_id         uuid NOT NULL REFERENCES esqueletoerp.importacion_items(id) ON DELETE CASCADE,
  serial          text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS importacion_seriales_uq ON esqueletoerp.importacion_seriales(empresa_id, upper(serial));
CREATE INDEX IF NOT EXISTS ix_imp_seriales_item ON esqueletoerp.importacion_seriales(item_id);

CREATE TABLE IF NOT EXISTS esqueletoerp.importacion_recepciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  importacion_id  uuid NOT NULL REFERENCES esqueletoerp.importaciones(id) ON DELETE CASCADE,
  fecha           date NOT NULL DEFAULT current_date,
  ubicacion_id    uuid,
  final           boolean NOT NULL DEFAULT false,
  observacion     text,
  usuario_id      uuid,
  usuario_nombre  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_imp_recepciones_imp ON esqueletoerp.importacion_recepciones(importacion_id);

CREATE TABLE IF NOT EXISTS esqueletoerp.importacion_recepcion_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  recepcion_id  uuid NOT NULL REFERENCES esqueletoerp.importacion_recepciones(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES esqueletoerp.importacion_items(id) ON DELETE CASCADE,
  cantidad      numeric NOT NULL CHECK (cantidad >= 0)
);
CREATE INDEX IF NOT EXISTS ix_imp_rec_items_rec ON esqueletoerp.importacion_recepcion_items(recepcion_id);

CREATE TABLE IF NOT EXISTS esqueletoerp.comex_incidencias (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  origen_tipo            text NOT NULL CHECK (origen_tipo IN ('IMPORTACION','EXPORTACION','CONTENEDOR')),
  origen_id              uuid NOT NULL,
  tipo                   text NOT NULL,
  descripcion            text NOT NULL,
  prioridad              text NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta')),
  estado                 text NOT NULL DEFAULT 'detectado'
                         CHECK (estado IN ('detectado','asignado','en_proceso','resuelto','verificado')),
  responsable_id         uuid,
  responsable_nombre     text,
  accion_correctiva      text,
  resuelto_at            timestamptz,
  verificado_at          timestamptz,
  verificado_por_nombre  text,
  created_by_nombre      text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_comex_inc_origen ON esqueletoerp.comex_incidencias(empresa_id, origen_tipo, origen_id);
CREATE INDEX IF NOT EXISTS ix_comex_inc_estado ON esqueletoerp.comex_incidencias(empresa_id, estado);

CREATE TABLE IF NOT EXISTS esqueletoerp.comex_historial (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  origen_tipo     text NOT NULL,
  origen_id       uuid NOT NULL,
  accion          text NOT NULL,
  detalle         jsonb,
  usuario_id      uuid,
  usuario_nombre  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_comex_hist_origen ON esqueletoerp.comex_historial(empresa_id, origen_tipo, origen_id, created_at DESC);

CREATE TABLE IF NOT EXISTS esqueletoerp.comex_adjuntos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  origen_tipo     text NOT NULL,
  origen_id       uuid NOT NULL,
  categoria       text,
  nombre          text NOT NULL,
  mime_type       text,
  size_bytes      bigint,
  storage_path    text NOT NULL,
  usuario_nombre  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_comex_adj_origen ON esqueletoerp.comex_adjuntos(empresa_id, origen_tipo, origen_id);

NOTIFY pgrst, 'reload schema';
