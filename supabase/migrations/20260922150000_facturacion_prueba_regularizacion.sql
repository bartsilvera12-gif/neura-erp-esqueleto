-- =============================================================================
-- Facturación: modo PRUEBA + regularización de facturas de agosto.
--
-- Modo prueba: mientras el contador no confirme el uso de Zentra en producción,
-- las facturas se emiten como PRUEBA con una numeración aparte, sin consumir
-- los números reales del timbrado. El admin lo apaga con "Pasar a producción".
--
-- Regularización: registro separado de las facturas emitidas por el sistema
-- anterior con timbrado incorrecto. Registrar una NO emite factura ni consume
-- correlativo; la reemisión es una acción aparte y queda vinculada.
--
-- Idempotente. Solo esqueletoerp.
-- =============================================================================

-- ── Modo prueba ──────────────────────────────────────────────────────────────
ALTER TABLE esqueletoerp.facturas_exportacion_config
  ADD COLUMN IF NOT EXISTS modo_prueba           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS proximo_numero_prueba integer NOT NULL DEFAULT 1;

ALTER TABLE esqueletoerp.facturas_exportacion
  ADD COLUMN IF NOT EXISTS prueba           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS regularizacion_id uuid;

-- El número real y el de prueba pueden coincidir: el UNIQUE pasa a incluir `prueba`.
DO $u$
DECLARE
  v_con text;
BEGIN
  SELECT c.conname INTO v_con
    FROM pg_constraint c
   WHERE c.conrelid = 'esqueletoerp.facturas_exportacion'::regclass
     AND c.contype = 'u'
     AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
            FROM pg_attribute a
           WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey))
         = ARRAY['empresa_id','establecimiento','numero','punto_expedicion','timbrado'];
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE esqueletoerp.facturas_exportacion DROP CONSTRAINT %I', v_con);
  END IF;
END
$u$;

CREATE UNIQUE INDEX IF NOT EXISTS facturas_exportacion_numero_uq
  ON esqueletoerp.facturas_exportacion (empresa_id, establecimiento, punto_expedicion, timbrado, numero, prueba);

-- Zentra todavía no factura en producción: lo emitido hasta hoy fueron pruebas.
-- Se marcan como PRUEBA y la numeración real vuelve a arrancar en 1.
UPDATE esqueletoerp.facturas_exportacion SET prueba = true WHERE prueba = false;

UPDATE esqueletoerp.facturas_exportacion_config c
   SET proximo_numero = 1,
       modo_prueba = true,
       proximo_numero_prueba = COALESCE((
         SELECT max(f.numero) + 1 FROM esqueletoerp.facturas_exportacion f
          WHERE f.empresa_id = c.empresa_id AND f.establecimiento = c.establecimiento
            AND f.punto_expedicion = c.punto_expedicion AND f.timbrado = c.timbrado AND f.prueba
       ), 1)
 WHERE c.timbrado = '19025402';

-- Correlativo atómico: el de prueba usa su propio contador y no tiene rango fiscal.
DROP FUNCTION IF EXISTS esqueletoerp.reservar_correlativo_factura_exportacion(uuid, text, text, text);

CREATE OR REPLACE FUNCTION esqueletoerp.reservar_correlativo_factura_exportacion(
  p_empresa_id uuid,
  p_establecimiento text,
  p_punto_expedicion text,
  p_timbrado text,
  p_prueba boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_numero integer;
  v_hasta integer;
BEGIN
  IF p_prueba THEN
    UPDATE esqueletoerp.facturas_exportacion_config
       SET proximo_numero_prueba = proximo_numero_prueba + 1, updated_at = now()
     WHERE empresa_id = p_empresa_id AND establecimiento = p_establecimiento
       AND punto_expedicion = p_punto_expedicion AND timbrado = p_timbrado AND activo
    RETURNING proximo_numero_prueba - 1 INTO v_numero;
  ELSE
    UPDATE esqueletoerp.facturas_exportacion_config
       SET proximo_numero = proximo_numero + 1, updated_at = now()
     WHERE empresa_id = p_empresa_id AND establecimiento = p_establecimiento
       AND punto_expedicion = p_punto_expedicion AND timbrado = p_timbrado AND activo
    RETURNING proximo_numero - 1, rango_hasta INTO v_numero, v_hasta;
  END IF;

  IF v_numero IS NULL THEN
    RAISE EXCEPTION 'No hay configuración activa para % / % / %', p_establecimiento, p_punto_expedicion, p_timbrado
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT p_prueba AND v_numero > v_hasta THEN
    RAISE EXCEPTION 'Numero % fuera del rango autorizado (hasta %)', v_numero, v_hasta
      USING ERRCODE = 'P0001';
  END IF;
  RETURN v_numero;
END
$fn$;

-- ── Regularización de agosto ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS esqueletoerp.facturas_regularizacion (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL,
  numero_original       text NOT NULL,
  fecha_original        date NOT NULL,
  timbrado_original     text NOT NULL,
  punto_original        text,
  cliente_nombre        text NOT NULL,
  cliente_pais          text,
  moneda                text NOT NULL DEFAULT 'USD',
  total                 numeric NOT NULL DEFAULT 0,
  pdf_path              text,
  motivo                text NOT NULL,
  estado                text NOT NULL DEFAULT 'PENDIENTE'
                        CHECK (estado IN ('PENDIENTE','CORRECTA','ANULADA','PENDIENTE_REEMISION','REEMITIDA')),
  factura_vinculada_id  uuid REFERENCES esqueletoerp.facturas_exportacion(id),
  observaciones         text,
  created_by            uuid,
  created_by_nombre     text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, timbrado_original, numero_original)
);

CREATE INDEX IF NOT EXISTS facturas_regularizacion_empresa_idx
  ON esqueletoerp.facturas_regularizacion (empresa_id, fecha_original DESC);

NOTIFY pgrst, 'reload schema';
