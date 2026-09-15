-- =============================================================================
-- Integraciones · Formularios ligados a API (PDF §8)
-- =============================================================================
-- Builder generico: cada formulario define su endpoint, metodo, headers y
-- campos (JSONB). El runtime pinta el formulario, arma el payload y hace el
-- POST/GET al endpoint. Cada ejecucion queda registrada para auditoria.
--
-- Idempotente. Corre en cualquier schema con la tabla 'empresas'.
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'empresas' AND c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog','information_schema')
  LOOP
    RAISE NOTICE '[integraciones_formularios_api] schema=%', r.sch;

    -- Formulario / conexion a API.
    -- campos JSONB shape:
    --   [{ "name":"cliente","label":"Cliente","type":"text","required":true,
    --      "placeholder":"...", "default":"" }, ...]
    -- Tipos soportados por el runtime: text, textarea, number, email, tel,
    -- date, checkbox, select (con "options":[...]).
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.formularios_api (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id         uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        nombre             text NOT NULL,
        descripcion        text,
        endpoint_url       text NOT NULL,
        metodo             text NOT NULL DEFAULT 'POST' CHECK (metodo IN ('GET','POST','PUT','PATCH','DELETE')),
        auth_header_name   text,
        auth_header_value  text,
        headers_extra      jsonb NOT NULL DEFAULT '{}'::jsonb,
        campos             jsonb NOT NULL DEFAULT '[]'::jsonb,
        activo             boolean NOT NULL DEFAULT true,
        created_by_user_id uuid,
        created_at         timestamptz NOT NULL DEFAULT now(),
        updated_at         timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch);

    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_formularios_api_empresa ON %I.formularios_api(empresa_id, activo)', r.sch);

    -- Log de cada envio.
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.formulario_ejecuciones (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id        uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        formulario_id     uuid NOT NULL REFERENCES %I.formularios_api(id) ON DELETE CASCADE,
        payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
        status            integer,
        respuesta         jsonb,
        error             text,
        created_by_user_id uuid,
        created_at        timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch, r.sch);

    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_form_ejec_form_fecha ON %I.formulario_ejecuciones(formulario_id, created_at DESC)', r.sch);
  END LOOP;
END
$mig$;
