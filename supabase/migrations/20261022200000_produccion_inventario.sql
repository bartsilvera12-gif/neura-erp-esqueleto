-- =============================================================================
-- Producción de muebles · Fase 4: inventario de tableros/herrajes por movimientos
-- =============================================================================
-- Según la especificación (sección 5.5 y 5.5.1, modelo de datos 6):
--   - El saldo NO se edita: se calcula a partir de movimientos confirmados.
--   - prod_inventario_movimientos: libro inmutable. Cada movimiento guarda su
--     efecto neto sobre el stock físico (delta_fisico) y sobre el stock físico
--     UTILIZABLE (delta_utilizable); una devolución dañada entra al físico pero
--     no al utilizable, por eso se separan.
--   - prod_inventario_reservas: compromiso de stock por proyecto (activa /
--     consumida / liberada). Stock disponible = físico utilizable − reservado.
--   - No se permite stock negativo por defecto (se valida en la API).
-- Solo esqueletoerp (Living Room). Idempotente.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

CREATE TABLE IF NOT EXISTS esqueletoerp.prod_inventario_movimientos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL,
  articulo_tipo   text NOT NULL,                       -- tablero | herraje
  articulo_id     uuid NOT NULL,
  tipo            text NOT NULL,                        -- recepcion_compra | entrega_contratista | devolucion_aceptada | devolucion_danada | ajuste_conteo | reverso
  cantidad        numeric NOT NULL DEFAULT 0,           -- magnitud registrada (informativa)
  delta_fisico    numeric NOT NULL DEFAULT 0,           -- efecto neto sobre el stock físico
  delta_utilizable numeric NOT NULL DEFAULT 0,          -- efecto neto sobre el stock físico utilizable
  unidad          text,
  ubicacion       text,
  origen_tipo     text,                                 -- compra | nota_entrega | conteo | devolucion | reverso | manual
  origen_id       uuid,
  referencia      text,                                 -- nro de documento / comprobante
  motivo          text,
  costo_unitario  numeric,                              -- opcional (valuación, Fase 6)
  reverso_de      uuid REFERENCES esqueletoerp.prod_inventario_movimientos(id),
  usuario_id      uuid,
  usuario_nombre  text,
  fecha           timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prod_inv_mov_articulo_idx
  ON esqueletoerp.prod_inventario_movimientos (empresa_id, articulo_tipo, articulo_id);

CREATE TABLE IF NOT EXISTS esqueletoerp.prod_inventario_reservas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL,
  proyecto_id     uuid REFERENCES esqueletoerp.prod_proyectos(id) ON DELETE CASCADE,
  articulo_tipo   text NOT NULL,                        -- tablero | herraje
  articulo_id     uuid NOT NULL,
  cantidad        numeric NOT NULL DEFAULT 0,
  estado          text NOT NULL DEFAULT 'activa',       -- activa | consumida | liberada
  motivo          text,
  usuario_id      uuid,
  usuario_nombre  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prod_inv_reserva_articulo_idx
  ON esqueletoerp.prod_inventario_reservas (empresa_id, articulo_tipo, articulo_id, estado);

COMMIT;

NOTIFY pgrst, 'reload schema';
