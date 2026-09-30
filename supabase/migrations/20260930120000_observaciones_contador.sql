-- Observaciones del contador (importaciones / remisiones). Solo esqueletoerp. Aditiva e idempotente.
SET lock_timeout = '5s';

-- Importación: unidad de medida de cada producto (el código ya se guarda en sku).
ALTER TABLE esqueletoerp.importacion_items ADD COLUMN IF NOT EXISTS unidad text;
UPDATE esqueletoerp.importacion_items i
   SET unidad = p.unidad_medida
  FROM esqueletoerp.productos p
 WHERE p.id = i.producto_id AND i.unidad IS NULL;

-- Notas de remisión: timbrado de la DNIT, marca del vehículo y de qué documento salió.
ALTER TABLE esqueletoerp.notas_remision
  ADD COLUMN IF NOT EXISTS timbrado         text,
  ADD COLUMN IF NOT EXISTS marca_vehiculo   text,
  ADD COLUMN IF NOT EXISTS documento_origen text;

CREATE TABLE IF NOT EXISTS esqueletoerp.notas_remision_config (
  empresa_id        uuid PRIMARY KEY REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  timbrado          text NOT NULL,
  establecimiento   text NOT NULL DEFAULT '001',
  punto_expedicion  text NOT NULL,
  vigencia_desde    date,
  vigencia_hasta    date,
  proximo_numero    integer NOT NULL DEFAULT 1 CHECK (proximo_numero >= 1),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

NOTIFY pgrst, 'reload schema';
