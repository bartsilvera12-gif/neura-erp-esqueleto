-- =============================================================================
-- Facturas: dos tipos (EXPORTACION / LOCAL) sobre el mismo módulo.
-- EXPORTACION: USD, exentas, datos de operación/logística/banco. Timbrado 19025402.
-- LOCAL: Gs., IVA 5/10, contado/crédito, nota de remisión. Timbrado 17943433.
-- Idempotente + aditivo. Solo esqueletoerp.
-- =============================================================================

ALTER TABLE esqueletoerp.facturas_exportacion_config
  ADD COLUMN IF NOT EXISTS tipo             text NOT NULL DEFAULT 'EXPORTACION',
  ADD COLUMN IF NOT EXISTS ruc              text,
  ADD COLUMN IF NOT EXISTS autoimpresor_nro text;

ALTER TABLE esqueletoerp.facturas_exportacion
  ADD COLUMN IF NOT EXISTS tipo                   text NOT NULL DEFAULT 'EXPORTACION',
  ADD COLUMN IF NOT EXISTS cliente_ciudad         text,
  ADD COLUMN IF NOT EXISTS cliente_telefono       text,
  ADD COLUMN IF NOT EXISTS condicion_venta        text NOT NULL DEFAULT 'CONTADO',
  ADD COLUMN IF NOT EXISTS nota_remision          text,
  ADD COLUMN IF NOT EXISTS tipo_operacion         text,
  ADD COLUMN IF NOT EXISTS condicion_negociacion  text,
  ADD COLUMN IF NOT EXISTS agente_transporte      text,
  ADD COLUMN IF NOT EXISTS barcaza                text,
  ADD COLUMN IF NOT EXISTS empresa_fletera        text,
  ADD COLUMN IF NOT EXISTS conocimiento           text,
  ADD COLUMN IF NOT EXISTS total_exentas          numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_gravado5         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_gravado10        numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva5                   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva10                  numeric NOT NULL DEFAULT 0;

ALTER TABLE esqueletoerp.facturas_exportacion_items
  ADD COLUMN IF NOT EXISTS iva_tipo text NOT NULL DEFAULT 'EXENTA';

-- Datos fiscales de la autorización en los puntos de exportación.
UPDATE esqueletoerp.facturas_exportacion_config
   SET tipo = 'EXPORTACION', ruc = '80150840-1', autoimpresor_nro = '350010028049'
 WHERE timbrado = '19025402';

-- Punto local 001-001, timbrado 17943433.
INSERT INTO esqueletoerp.facturas_exportacion_config
  (empresa_id, establecimiento, punto_expedicion, timbrado, vigencia_desde, vigencia_hasta,
   rango_desde, rango_hasta, proximo_numero, activo, tipo, ruc, autoimpresor_nro)
VALUES
  ('3c14fe00-d466-4f24-a010-1bbd7e37ccd6', '001', '001', '17943433', DATE '2025-04-02', DATE '2026-04-30',
   1, 9999999, 1, true, 'LOCAL', '80150840-1', '350010028049')
ON CONFLICT (empresa_id, establecimiento, punto_expedicion, timbrado) DO NOTHING;

-- Correlativo atómico con control de rango: si se excede, el RAISE revierte el incremento.
CREATE OR REPLACE FUNCTION esqueletoerp.reservar_correlativo_factura_exportacion(
  p_empresa_id uuid,
  p_establecimiento text,
  p_punto_expedicion text,
  p_timbrado text
) RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_numero integer;
  v_hasta integer;
BEGIN
  UPDATE esqueletoerp.facturas_exportacion_config
     SET proximo_numero = proximo_numero + 1,
         updated_at = now()
   WHERE empresa_id = p_empresa_id
     AND establecimiento = p_establecimiento
     AND punto_expedicion = p_punto_expedicion
     AND timbrado = p_timbrado
     AND activo = true
  RETURNING proximo_numero - 1, rango_hasta INTO v_numero, v_hasta;

  IF v_numero IS NULL THEN
    RAISE EXCEPTION 'No hay configuración activa para % / % / %', p_establecimiento, p_punto_expedicion, p_timbrado
      USING ERRCODE = 'P0002';
  END IF;
  IF v_numero > v_hasta THEN
    RAISE EXCEPTION 'Numero % fuera del rango autorizado (hasta %)', v_numero, v_hasta
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_numero;
END
$fn$;

NOTIFY pgrst, 'reload schema';
