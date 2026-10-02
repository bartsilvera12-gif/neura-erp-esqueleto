-- =============================================================================
-- Comercio Exterior · Gastos incurridos por operación
-- =============================================================================
-- Lo que realmente costó traer o enviar la mercadería además del valor de la
-- factura: flete, seguro, despachante, tributos aduaneros, almacenaje,
-- transporte interno, gastos bancarios. Se cargan por importación o por
-- exportación y se ven en la pestaña "Gastos" de cada operación.
--
-- `tipo_cambio` convierte a guaraníes para poder totalizar: el monto en Gs. es
-- monto * tipo_cambio (1 cuando el gasto ya está en PYG).
--
-- Aditiva e idempotente. Solo esqueletoerp (base compartida).
-- =============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS esqueletoerp.comex_gastos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  origen_tipo      text NOT NULL CHECK (origen_tipo IN ('IMPORTACION','EXPORTACION')),
  origen_id        uuid NOT NULL,
  fecha            date NOT NULL DEFAULT current_date,
  tipo             text NOT NULL DEFAULT 'OTRO',
  descripcion      text,
  proveedor_nombre text,
  comprobante      text,
  monto            numeric NOT NULL DEFAULT 0 CHECK (monto >= 0),
  moneda           text NOT NULL DEFAULT 'PYG' CHECK (moneda IN ('PYG','USD','BOB')),
  tipo_cambio      numeric NOT NULL DEFAULT 1 CHECK (tipo_cambio > 0),
  pagado           boolean NOT NULL DEFAULT false,
  usuario_nombre   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_comex_gastos_origen
  ON esqueletoerp.comex_gastos(empresa_id, origen_tipo, origen_id, fecha DESC);

NOTIFY pgrst, 'reload schema';
