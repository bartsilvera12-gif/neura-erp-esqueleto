-- Notas de remisión: modo prueba por timbrado, igual que en facturación.
-- Las notas de prueba usan su propio contador, salen marcadas y no mueven stock.
-- Solo esqueletoerp. Aditiva e idempotente.
SET lock_timeout = '5s';

-- Arranca en prueba: así nadie gasta numeración real sin querer.
ALTER TABLE esqueletoerp.notas_remision_config
  ADD COLUMN IF NOT EXISTS modo_prueba           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS proximo_numero_prueba integer NOT NULL DEFAULT 1 CHECK (proximo_numero_prueba >= 1);

ALTER TABLE esqueletoerp.notas_remision ADD COLUMN IF NOT EXISTS prueba boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
