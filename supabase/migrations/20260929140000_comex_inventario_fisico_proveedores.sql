-- =============================================================================
-- Comercio Exterior · parte 3 (PDF "Comercio Exterior, Inventario y Control
-- Operativo" §6, §7, §8): inventario físico (conteos + ajuste autorizado),
-- compromisos de proveedores y plazo en las incidencias.
-- Solo esqueletoerp. Aditiva e idempotente.
-- =============================================================================

SET lock_timeout = '5s';

-- Conteo físico: una sesión de conteo por depósito / sector.
CREATE TABLE IF NOT EXISTS esqueletoerp.inventario_conteos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  numero                text NOT NULL,
  ubicacion_id          uuid,
  ubicacion_nombre      text,
  pais                  text,
  sector                text,
  categoria_id          uuid,
  categoria_nombre      text,
  responsable_id        uuid,
  responsable_nombre    text NOT NULL,
  estado                text NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso','cerrado','ajustado','anulado')),
  observaciones         text,
  cerrado_at            timestamptz,
  ajustado_at           timestamptz,
  ajustado_por_nombre   text,
  created_by_nombre     text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventario_conteos_numero_uk UNIQUE (empresa_id, numero)
);

CREATE TABLE IF NOT EXISTS esqueletoerp.inventario_conteo_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  conteo_id           uuid NOT NULL REFERENCES esqueletoerp.inventario_conteos(id) ON DELETE CASCADE,
  producto_id         uuid REFERENCES esqueletoerp.productos(id) ON DELETE SET NULL,
  producto_nombre     text NOT NULL,
  sku                 text,
  categoria_nombre    text,
  stock_sistema       numeric NOT NULL DEFAULT 0,
  cantidad_fisica     numeric,
  motivo              text,
  contado_por_nombre  text,
  contado_at          timestamptz,
  ajustado            boolean NOT NULL DEFAULT false,
  CONSTRAINT inventario_conteo_items_uk UNIQUE (conteo_id, producto_id)
);
CREATE INDEX IF NOT EXISTS ix_conteo_items_conteo ON esqueletoerp.inventario_conteo_items(conteo_id);

-- Compromisos de proveedores: qué prometió, para cuándo y si cumplió.
CREATE TABLE IF NOT EXISTS esqueletoerp.proveedor_compromisos (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  proveedor_id            uuid,
  proveedor_nombre        text NOT NULL,
  importacion_id          uuid REFERENCES esqueletoerp.importaciones(id) ON DELETE SET NULL,
  productos               text NOT NULL,
  cantidad                numeric,
  fecha_comprometida      date NOT NULL,
  fecha_real              date,
  documentacion_requerida text,
  documentacion_completa  boolean NOT NULL DEFAULT false,
  estado                  text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','cumplido','cancelado')),
  responsable_id          uuid,
  responsable_nombre      text,
  observaciones           text,
  created_by_nombre       text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_prov_comp_empresa ON esqueletoerp.proveedor_compromisos(empresa_id, estado, fecha_comprometida);

-- Incidencias: también de conteos y compromisos, y con plazo para escalar.
ALTER TABLE esqueletoerp.comex_incidencias ADD COLUMN IF NOT EXISTS fecha_limite date;
ALTER TABLE esqueletoerp.comex_incidencias DROP CONSTRAINT IF EXISTS comex_incidencias_origen_tipo_check;
ALTER TABLE esqueletoerp.comex_incidencias
  ADD CONSTRAINT comex_incidencias_origen_tipo_check
  CHECK (origen_tipo IN ('IMPORTACION','EXPORTACION','CONTENEDOR','CONTEO','COMPROMISO'));

NOTIFY pgrst, 'reload schema';
