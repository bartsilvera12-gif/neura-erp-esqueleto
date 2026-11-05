-- =============================================================================
-- Inventario de herramientas y máquinas
-- =============================================================================
-- Tabla aparte del inventario de productos: registra herramientas / máquinas
-- de la empresa con su estado operativo (funcionando, averiada, en reparación,
-- dada de baja). Multi-tenant: se crea en cada schema que tenga la tabla
-- `empresas` (= cada tenant).
--
-- Es ADITIVA e IDEMPOTENTE: usa CREATE TABLE IF NOT EXISTS; si corre dos
-- veces no cambia nada.
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'empresas' AND c.relkind = 'r'
  LOOP
    RAISE NOTICE '[herramientas] schema=%', r.sch;

    EXECUTE format($sql$
      CREATE TABLE IF NOT EXISTS %I.herramientas (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id      uuid NOT NULL,
        nombre          text NOT NULL,
        categoria       text,
        marca           text,
        modelo          text,
        numero_serie    text,
        ubicacion       text,
        responsable     text,
        estado          text NOT NULL DEFAULT 'FUNCIONANDO',
        fecha_adquisicion date,
        costo           numeric(14,2),
        observaciones   text,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT herramientas_estado_chk CHECK (estado IN ('FUNCIONANDO','AVERIADA','EN_REPARACION','DADA_DE_BAJA'))
      )
    $sql$, r.sch);

    EXECUTE format('CREATE INDEX IF NOT EXISTS herramientas_empresa_idx ON %I.herramientas(empresa_id)', r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS herramientas_estado_idx ON %I.herramientas(empresa_id, estado)', r.sch);
  END LOOP;
END
$mig$;
