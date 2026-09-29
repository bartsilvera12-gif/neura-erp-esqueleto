-- =============================================================================
-- Tesorería: cuentas bancarias con saldo, pagos de compras desde banco o caja
-- chica, reposición y arqueo de caja chica (pedido del cliente 25/09).
-- Reutiliza entidades_bancarias / banco_movimientos / cajas_chicas /
-- caja_chica_movimientos, agregando lo que les falta. Solo esqueletoerp.
-- Aditiva e idempotente.
-- =============================================================================

SET lock_timeout = '5s';

-- Cuenta bancaria: número, moneda, titular y saldo de arranque.
ALTER TABLE esqueletoerp.entidades_bancarias
  ADD COLUMN IF NOT EXISTS numero_cuenta          text,
  ADD COLUMN IF NOT EXISTS moneda                 text NOT NULL DEFAULT 'PYG',
  ADD COLUMN IF NOT EXISTS titular                text,
  ADD COLUMN IF NOT EXISTS saldo_inicial          numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha_saldo_inicial    date,
  ADD COLUMN IF NOT EXISTS cuenta_contable_codigo text;

-- Movimientos vinculados a su origen (pago de compra, reposición, arqueo).
ALTER TABLE esqueletoerp.banco_movimientos
  ADD COLUMN IF NOT EXISTS compra_id            uuid,
  ADD COLUMN IF NOT EXISTS compra_pago_id       uuid,
  ADD COLUMN IF NOT EXISTS transferencia_grupo  uuid,
  ADD COLUMN IF NOT EXISTS usuario_nombre       text;

ALTER TABLE esqueletoerp.cajas_chicas
  ADD COLUMN IF NOT EXISTS fondo_fijo             numeric,
  ADD COLUMN IF NOT EXISTS responsable_id         uuid,
  ADD COLUMN IF NOT EXISTS responsable_nombre     text,
  ADD COLUMN IF NOT EXISTS cuenta_contable_codigo text;

ALTER TABLE esqueletoerp.caja_chica_movimientos
  ADD COLUMN IF NOT EXISTS compra_id            uuid,
  ADD COLUMN IF NOT EXISTS compra_pago_id       uuid,
  ADD COLUMN IF NOT EXISTS arqueo_id            uuid,
  ADD COLUMN IF NOT EXISTS transferencia_grupo  uuid;

-- Pagos de compras (contado al registrar; crédito cuota por cuota).
CREATE TABLE IF NOT EXISTS esqueletoerp.libro_compras_pagos (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  compra_id                 uuid NOT NULL REFERENCES esqueletoerp.libro_compras(id) ON DELETE CASCADE,
  cuota_nro                 integer,
  fecha                     date NOT NULL,
  monto                     numeric NOT NULL CHECK (monto > 0),
  medio                     text NOT NULL CHECK (medio IN ('BANCO','CAJA_CHICA')),
  entidad_bancaria_id       uuid,
  caja_chica_id             uuid,
  referencia                text,
  banco_movimiento_id       uuid,
  caja_chica_movimiento_id  uuid,
  estado                    text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente','anulado')),
  anulado_motivo            text,
  usuario_nombre            text,
  created_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_lc_pagos_compra ON esqueletoerp.libro_compras_pagos(compra_id);

-- Arqueos de caja chica: lo que dice el sistema contra lo contado.
CREATE TABLE IF NOT EXISTS esqueletoerp.caja_chica_arqueos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  caja_chica_id         uuid NOT NULL REFERENCES esqueletoerp.cajas_chicas(id) ON DELETE CASCADE,
  fecha                 timestamptz NOT NULL DEFAULT now(),
  saldo_sistema         numeric NOT NULL,
  contado               numeric NOT NULL,
  diferencia            numeric NOT NULL,
  detalle               jsonb,
  observacion           text,
  ajuste_movimiento_id  uuid,
  usuario_nombre        text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_cc_arqueos_caja ON esqueletoerp.caja_chica_arqueos(caja_chica_id, fecha DESC);

NOTIFY pgrst, 'reload schema';
