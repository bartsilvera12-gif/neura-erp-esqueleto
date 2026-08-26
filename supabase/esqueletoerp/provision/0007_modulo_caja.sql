-- =============================================================================
-- Esqueleto ERP — PASO 7: modulo Caja (apertura, movimientos y cierre con arqueo)
-- =============================================================================
-- Portado de `stzautopartes-erp`. Alla las tablas se crearon directo en la base
-- (no habia migracion versionada), asi que este DDL se derivo de las columnas
-- que realmente usa `src/lib/caja/server.ts`.
--
-- Una "caja" es un TURNO: se abre con un monto inicial, mientras esta abierta se
-- le imputan las ventas (ventas.caja_id) y los movimientos manuales, y se cierra
-- contando el efectivo (arqueo). Soporta varios turnos activos a la vez
-- (Caja 1, Caja 2, ...) via `numero_caja`.
--
-- Solo escribe en `esqueletoerp`. Idempotente.
-- Requiere el rol propietario del schema (ver pasos 1 y 2).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) cajas — cabecera del turno
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS esqueletoerp.cajas (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  numero_caja             integer NOT NULL DEFAULT 1,
  estado                  text NOT NULL DEFAULT 'abierta',
  abierta_por             uuid NULL REFERENCES esqueletoerp.usuarios(id) ON DELETE SET NULL,
  cerrada_por             uuid NULL REFERENCES esqueletoerp.usuarios(id) ON DELETE SET NULL,
  fecha_apertura          timestamptz NOT NULL DEFAULT now(),
  fecha_cierre            timestamptz NULL,
  monto_apertura          numeric NOT NULL DEFAULT 0,
  monto_cierre_contado    numeric NULL,
  monto_esperado_efectivo numeric NULL,
  diferencia              numeric NULL,
  observacion_apertura    text NULL,
  observacion_cierre      text NULL,
  -- Detalle del conteo fisico por denominacion. NULL si se cargo el monto directo.
  arqueo_apertura_json    jsonb NULL,
  arqueo_cierre_json      jsonb NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cajas_estado_check CHECK (estado IN ('abierta', 'en_cierre', 'cerrada')),
  CONSTRAINT cajas_numero_caja_check CHECK (numero_caja >= 1)
);

-- Un solo turno ACTIVO por numero de caja. Los cerrados no cuentan, por eso el
-- indice es parcial: permite historial ilimitado sobre el mismo numero.
CREATE UNIQUE INDEX IF NOT EXISTS cajas_activa_por_numero_uidx
  ON esqueletoerp.cajas (empresa_id, numero_caja)
  WHERE estado IN ('abierta', 'en_cierre');

CREATE INDEX IF NOT EXISTS idx_cajas_empresa_estado
  ON esqueletoerp.cajas (empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_cajas_empresa_apertura
  ON esqueletoerp.cajas (empresa_id, fecha_apertura DESC);

-- -----------------------------------------------------------------------------
-- 2) caja_movimientos — ingresos, egresos, retiros y ajustes manuales del turno
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS esqueletoerp.caja_movimientos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  caja_id         uuid NOT NULL REFERENCES esqueletoerp.cajas(id) ON DELETE CASCADE,
  tipo            text NOT NULL,
  concepto        text NOT NULL,
  monto           numeric NOT NULL,
  medio_pago      text NOT NULL DEFAULT 'efectivo',
  usuario_id      uuid NULL REFERENCES esqueletoerp.usuarios(id) ON DELETE SET NULL,
  usuario_email   text NULL,
  observacion     text NULL,
  -- Anulacion (solo aplica a "Otros ingresos"). Un movimiento anulado no entra
  -- en el arqueo, pero no se borra: queda la traza de quien y por que.
  anulado_at      timestamptz NULL,
  anulado_por_id  uuid NULL REFERENCES esqueletoerp.usuarios(id) ON DELETE SET NULL,
  anulado_motivo  text NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT caja_movimientos_tipo_check
    CHECK (tipo IN ('ingreso', 'egreso', 'retiro', 'ajuste')),
  CONSTRAINT caja_movimientos_medio_pago_check
    CHECK (medio_pago IN ('efectivo', 'tarjeta', 'transferencia', 'otro'))
);

CREATE INDEX IF NOT EXISTS idx_caja_mov_caja
  ON esqueletoerp.caja_movimientos (caja_id);
CREATE INDEX IF NOT EXISTS idx_caja_mov_empresa_caja_activos
  ON esqueletoerp.caja_movimientos (empresa_id, caja_id)
  WHERE anulado_at IS NULL;

-- -----------------------------------------------------------------------------
-- 3) ventas.caja_id — imputa cada venta al turno en el que se cobro
-- -----------------------------------------------------------------------------
ALTER TABLE esqueletoerp.ventas
  ADD COLUMN IF NOT EXISTS caja_id uuid NULL;

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint co
    JOIN pg_class cl ON cl.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'esqueletoerp' AND cl.relname = 'ventas'
      AND co.conname = 'ventas_caja_id_fkey'
  ) THEN
    ALTER TABLE esqueletoerp.ventas
      ADD CONSTRAINT ventas_caja_id_fkey
      FOREIGN KEY (caja_id) REFERENCES esqueletoerp.cajas(id) ON DELETE SET NULL;
  END IF;
END
$fk$;

CREATE INDEX IF NOT EXISTS idx_ventas_caja
  ON esqueletoerp.ventas (empresa_id, caja_id);

-- -----------------------------------------------------------------------------
-- 4) RLS — mismo patron que el resto del schema
-- -----------------------------------------------------------------------------
ALTER TABLE esqueletoerp.cajas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE esqueletoerp.caja_movimientos ENABLE ROW LEVEL SECURITY;

DO $rls$
DECLARE
  t text;
  c text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cajas', 'caja_movimientos'] LOOP
    FOREACH c IN ARRAY ARRAY['select', 'insert', 'update', 'delete'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON esqueletoerp.%I', t || '_' || c, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON esqueletoerp.%I AS PERMISSIVE FOR SELECT USING (esqueletoerp.puede_acceder_empresa(empresa_id))',
      t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON esqueletoerp.%I AS PERMISSIVE FOR INSERT WITH CHECK (esqueletoerp.puede_acceder_empresa(empresa_id))',
      t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON esqueletoerp.%I AS PERMISSIVE FOR UPDATE USING (esqueletoerp.puede_acceder_empresa(empresa_id)) WITH CHECK (esqueletoerp.puede_acceder_empresa(empresa_id))',
      t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON esqueletoerp.%I AS PERMISSIVE FOR DELETE USING (esqueletoerp.puede_acceder_empresa(empresa_id))',
      t || '_delete', t);
  END LOOP;
END
$rls$;

-- -----------------------------------------------------------------------------
-- 5) Permisos (igual que el resto de las tablas del schema)
-- -----------------------------------------------------------------------------
GRANT ALL ON esqueletoerp.cajas            TO anon, authenticated, service_role;
GRANT ALL ON esqueletoerp.caja_movimientos TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- VERIFICACION
-- -----------------------------------------------------------------------------
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'esqueletoerp'
  AND (table_name IN ('cajas', 'caja_movimientos')
       OR (table_name = 'ventas' AND column_name = 'caja_id'))
ORDER BY table_name, ordinal_position;

-- Debe listar 4 politicas por tabla.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'esqueletoerp' AND tablename IN ('cajas', 'caja_movimientos')
ORDER BY tablename, policyname;
