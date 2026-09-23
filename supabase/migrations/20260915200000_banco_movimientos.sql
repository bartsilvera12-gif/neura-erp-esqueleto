-- =============================================================================
-- Bancos · Movimientos (PDF §2 "Retiros bancarios")
-- =============================================================================
-- Registro de movimientos de dinero contra una entidad bancaria: retiros,
-- depositos, transferencias y ajustes. Cubre el requerimiento del PDF §2:
--   "Retiros bancarios: contemplar como caso de uso el retiro de fondos del
--    banco y su posterior aplicacion/registro."
--
-- Idempotente. Corre en cualquier schema con la tabla 'entidades_bancarias'.
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'entidades_bancarias' AND c.relkind = 'r'
      AND n.nspname = 'esqueletoerp'  -- base compartida: solo este esquema
  LOOP
    RAISE NOTICE '[banco_movimientos] schema=%', r.sch;

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.banco_movimientos (
        id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id            uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        entidad_bancaria_id   uuid NOT NULL REFERENCES %I.entidades_bancarias(id) ON DELETE RESTRICT,
        tipo                  text NOT NULL
                              CHECK (tipo IN ('retiro','deposito','transferencia_in','transferencia_out','ajuste')),
        monto                 numeric NOT NULL CHECK (monto > 0),
        moneda                text NOT NULL DEFAULT 'PYG',
        fecha                 date NOT NULL DEFAULT current_date,
        referencia            text,
        observacion           text,
        entidad_contraparte_id uuid REFERENCES %I.entidades_bancarias(id) ON DELETE SET NULL,
        gasto_id              uuid,
        created_by_user_id    uuid,
        usuario_nombre        text,
        created_at            timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch, r.sch, r.sch);

    -- FK opcional a gastos si la tabla existe
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname='gastos' AND n.nspname = r.sch) THEN
      BEGIN
        EXECUTE format($f$
          ALTER TABLE %I.banco_movimientos
            ADD CONSTRAINT banco_movimientos_gasto_id_fkey
            FOREIGN KEY (gasto_id) REFERENCES %I.gastos(id) ON DELETE SET NULL
        $f$, r.sch, r.sch);
      EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_banco_movimientos_empresa_fecha ON %I.banco_movimientos(empresa_id, fecha DESC)', r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_banco_movimientos_entidad ON %I.banco_movimientos(entidad_bancaria_id, fecha DESC)', r.sch);
  END LOOP;
END
$mig$;
