-- =============================================================================
-- Producción de muebles · Fase 6a: gastos/compras imputados al proyecto
-- =============================================================================
-- Según la especificación (sección 5.8, reglas RB-012 y RB-016):
--   - prod_gastos: costo real registrado. Se asigna a un proyecto de producción
--     o se marca como gasto general (RB-016: no aceptar gastos huérfanos).
--   - Categorías de la spec: material, transporte, consumible, instalacion,
--     reparacion, alquiler, contratista, otro.
--   - Distingue si tiene comprobante (para alertas de cierre) y guarda número y
--     archivo del comprobante. RB-012: evitar duplicar proveedor+número.
-- Solo esqueletoerp (Living Room). Idempotente.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

CREATE TABLE IF NOT EXISTS esqueletoerp.prod_gastos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL,
  proyecto_id        uuid REFERENCES esqueletoerp.prod_proyectos(id) ON DELETE SET NULL,
  es_general         boolean NOT NULL DEFAULT false,     -- true = gasto general (sin proyecto)
  categoria          text NOT NULL DEFAULT 'otro',       -- material|transporte|consumible|instalacion|reparacion|alquiler|contratista|otro
  proveedor_id       uuid,
  proveedor_nombre   text,
  concepto           text NOT NULL,
  fecha              date NOT NULL DEFAULT current_date,
  cantidad           numeric NOT NULL DEFAULT 1,
  costo_unitario     numeric NOT NULL DEFAULT 0,
  monto              numeric NOT NULL DEFAULT 0,
  tiene_comprobante  boolean NOT NULL DEFAULT false,
  comprobante_numero text,
  comprobante_path   text,
  aprobado           boolean NOT NULL DEFAULT true,
  observaciones      text,
  created_by         uuid,
  created_by_nombre  text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prod_gastos_proyecto_idx ON esqueletoerp.prod_gastos (empresa_id, proyecto_id);
-- RB-012: ayuda a detectar duplicados proveedor+número (no único: puede repetirse legítimamente con aviso).
CREATE INDEX IF NOT EXISTS prod_gastos_comprobante_idx ON esqueletoerp.prod_gastos (empresa_id, proveedor_id, comprobante_numero);

COMMIT;

NOTIFY pgrst, 'reload schema';
