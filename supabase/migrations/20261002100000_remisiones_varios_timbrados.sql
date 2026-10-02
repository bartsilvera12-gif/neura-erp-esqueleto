-- Notas de remisión: varios timbrados (uno por punto de expedición), como en
-- facturación. Antes había uno solo por empresa.
-- Solo esqueletoerp. Aditiva e idempotente.
SET lock_timeout = '5s';

ALTER TABLE esqueletoerp.notas_remision_config ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE esqueletoerp.notas_remision_config SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE esqueletoerp.notas_remision_config ALTER COLUMN id SET NOT NULL;
ALTER TABLE esqueletoerp.notas_remision_config ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  -- La clave primaria pasa de empresa_id a id, para permitir varias filas.
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'esqueletoerp' AND t.relname = 'notas_remision_config'
      AND c.contype = 'p' AND c.conname = 'notas_remision_config_pkey'
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = t.oid AND attname = 'empresa_id')]
  ) THEN
    ALTER TABLE esqueletoerp.notas_remision_config DROP CONSTRAINT notas_remision_config_pkey;
    ALTER TABLE esqueletoerp.notas_remision_config ADD PRIMARY KEY (id);
  END IF;
END $$;

-- Un timbrado por punto de expedición.
CREATE UNIQUE INDEX IF NOT EXISTS notas_remision_config_punto_uq
  ON esqueletoerp.notas_remision_config (empresa_id, establecimiento, punto_expedicion, timbrado);

-- Con qué timbrado salió cada nota, para que el histórico no cambie.
ALTER TABLE esqueletoerp.notas_remision ADD COLUMN IF NOT EXISTS timbrado_config_id uuid;

NOTIFY pgrst, 'reload schema';
