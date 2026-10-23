-- =============================================================================
-- Producción de muebles · Fase 5b: notas de entrega y conciliación con contratista
-- =============================================================================
-- Según la especificación (sección 5.6):
--   - prod_notas_entrega: documento correlativo (NE-AAAA-NNNN) por proyecto y
--     contratista. tipo entrega | devolucion. Estados borrador | confirmada |
--     anulada (con motivo). Firma escaneada/foto opcional (firma_path).
--   - prod_nota_entrega_detalle: artículos del documento (tablero/herraje),
--     cantidad, unidad y condición (buena/dañada, para devoluciones). Al
--     confirmar la nota, cada línea genera un movimiento de inventario y se
--     guarda su id (movimiento_id) para poder reversarlo si se anula.
-- Entrega confirmada  → movimiento entrega_contratista (salida de stock físico).
-- Devolución confirmada → devolucion_aceptada (buena) o devolucion_danada.
-- Solo esqueletoerp (Living Room). Idempotente.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

CREATE TABLE IF NOT EXISTS esqueletoerp.prod_notas_entrega (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL,
  numero            text NOT NULL,
  proyecto_id       uuid NOT NULL REFERENCES esqueletoerp.prod_proyectos(id) ON DELETE CASCADE,
  contratista_id    uuid REFERENCES esqueletoerp.prod_contratistas(id),
  contratista_nombre text,
  tipo              text NOT NULL DEFAULT 'entrega',    -- entrega | devolucion
  fecha             date NOT NULL DEFAULT current_date,
  estado            text NOT NULL DEFAULT 'borrador',   -- borrador | confirmada | anulada
  firma_path        text,
  observaciones     text,
  motivo_anulacion  text,
  created_by        uuid,
  created_by_nombre text,
  confirmada_por    text,
  confirmada_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prod_notas_entrega_numero_uk
  ON esqueletoerp.prod_notas_entrega (empresa_id, upper(btrim(numero)));

CREATE TABLE IF NOT EXISTS esqueletoerp.prod_nota_entrega_detalle (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL,
  nota_id           uuid NOT NULL REFERENCES esqueletoerp.prod_notas_entrega(id) ON DELETE CASCADE,
  articulo_tipo     text NOT NULL,                      -- tablero | herraje
  articulo_id       uuid NOT NULL,
  descripcion       text,
  cantidad          numeric NOT NULL DEFAULT 0,
  unidad            text,
  condicion         text NOT NULL DEFAULT 'buena',      -- buena | danada (para devoluciones)
  movimiento_id     uuid,                               -- movimiento de inventario generado al confirmar
  observaciones     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prod_nota_entrega_detalle_nota_idx
  ON esqueletoerp.prod_nota_entrega_detalle (empresa_id, nota_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
