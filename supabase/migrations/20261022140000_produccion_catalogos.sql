-- =============================================================================
-- Producción de muebles (MDF/MDP) · Fase 1: catálogos base
-- =============================================================================
-- Según la especificación del cliente (secciones 5.2, 5.4 y modelo de datos):
--   - prod_tableros: catálogo de tableros MDF/MDP.
--   - prod_herrajes: catálogo de herrajes.
--   - prod_contratistas: contratistas de fabricación externa.
-- Solo esqueletoerp (Living Room). Idempotente.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

-- ── Catálogo de tableros (5.2) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS esqueletoerp.prod_tableros (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL,
  codigo           text NOT NULL,                 -- código interno, único por empresa
  tipo             text NOT NULL DEFAULT 'MDF',   -- MDF | MDP | otro
  espesor_valor    numeric,                       -- ej. 18
  espesor_unidad   text DEFAULT 'mm',
  color_acabado    text,
  largo            numeric,                       -- dimensión de plancha
  ancho            numeric,
  dimension_unidad text DEFAULT 'mm',
  marca            text,
  proveedor_id     uuid REFERENCES esqueletoerp.proveedores(id) ON DELETE SET NULL,
  unidad_compra    text DEFAULT 'PLANCHA',
  costo_referencia numeric DEFAULT 0,
  activo           boolean NOT NULL DEFAULT true,
  observaciones    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prod_tableros_empresa_codigo_uk
  ON esqueletoerp.prod_tableros (empresa_id, upper(btrim(codigo)));

-- ── Catálogo de herrajes (5.4) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS esqueletoerp.prod_herrajes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL,
  codigo           text NOT NULL,
  descripcion      text NOT NULL,
  categoria        text,
  marca_modelo     text,
  especificacion   text,
  unidad           text DEFAULT 'UNIDAD',
  proveedor_id     uuid REFERENCES esqueletoerp.proveedores(id) ON DELETE SET NULL,
  stock_minimo     numeric DEFAULT 0,
  costo_referencia numeric DEFAULT 0,
  activo           boolean NOT NULL DEFAULT true,
  observaciones    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prod_herrajes_empresa_codigo_uk
  ON esqueletoerp.prod_herrajes (empresa_id, upper(btrim(codigo)));

-- ── Contratistas (modelo de datos) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS esqueletoerp.prod_contratistas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL,
  nombre         text NOT NULL,
  identificacion text,                            -- RUC / CI
  contacto       text,
  telefono       text,
  especialidad   text,
  activo         boolean NOT NULL DEFAULT true,
  observaciones  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMIT;

NOTIFY pgrst, 'reload schema';
