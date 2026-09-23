-- =============================================================================
-- Facturación: borradores, código/unidad/descuento por ítem, equivalente en Gs.
-- y cliente vinculado. Idempotente. Solo esqueletoerp.
-- =============================================================================

-- Borrador: guardado sin número fiscal (numero NULL hasta emitir).
ALTER TABLE esqueletoerp.facturas_exportacion ALTER COLUMN numero DROP NOT NULL;

DO $c$
DECLARE
  v_con text;
BEGIN
  SELECT conname INTO v_con
    FROM pg_constraint
   WHERE conrelid = 'esqueletoerp.facturas_exportacion'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%estado%';
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE esqueletoerp.facturas_exportacion DROP CONSTRAINT %I', v_con);
  END IF;
END
$c$;

ALTER TABLE esqueletoerp.facturas_exportacion
  ADD CONSTRAINT facturas_exportacion_estado_chk
  CHECK (estado IN ('BORRADOR','EMITIDA','ANULADA')
         AND (estado = 'BORRADOR' OR numero IS NOT NULL));

ALTER TABLE esqueletoerp.facturas_exportacion
  ADD COLUMN IF NOT EXISTS total_pyg      numeric,
  ADD COLUMN IF NOT EXISTS total_descuento numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cliente_id     uuid,
  ADD COLUMN IF NOT EXISTS cliente_email  text,
  ADD COLUMN IF NOT EXISTS emitida_at     timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by_nombre text;

ALTER TABLE esqueletoerp.facturas_exportacion_items
  ADD COLUMN IF NOT EXISTS codigo    text,
  ADD COLUMN IF NOT EXISTS unidad    text,
  ADD COLUMN IF NOT EXISTS descuento numeric NOT NULL DEFAULT 0;

-- Facturas ya emitidas: fecha de emisión = creación; equivalente en Gs. según su tipo de cambio.
UPDATE esqueletoerp.facturas_exportacion
   SET emitida_at = COALESCE(emitida_at, created_at),
       total_pyg  = COALESCE(total_pyg, CASE WHEN moneda = 'PYG' THEN total ELSE round(total * tipo_cambio) END)
 WHERE estado <> 'BORRADOR';

CREATE INDEX IF NOT EXISTS facturas_exportacion_auditoria_empresa_idx
  ON esqueletoerp.facturas_exportacion_auditoria (empresa_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
