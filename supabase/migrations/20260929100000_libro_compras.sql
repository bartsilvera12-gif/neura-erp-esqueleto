-- =============================================================================
-- Libro de compras (pedido del cliente 25/09: registro de facturas de compra
-- con CDC, renglones por cuenta, cuotas, retenciones y pre-asiento).
-- Solo esqueletoerp (base compartida). Aditiva e idempotente.
--
--   compra_tipos_comprobante   los tipos que usa Living Room, con su cuenta
--   libro_compras_config       cuentas para el pre-asiento (IVA, proveedores)
--   libro_compras              el comprobante
--   libro_compras_lineas       renglones por cuenta contable
--   libro_compras_cuotas       vencimientos de las compras a crédito
-- Adjuntos e historial usan comex_adjuntos / comex_historial con origen COMPRA.
-- No mueve stock ni genera asientos todavía.
-- =============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS esqueletoerp.compra_tipos_comprobante (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  codigo              integer NOT NULL,
  nombre              text NOT NULL,
  uso                 text NOT NULL DEFAULT 'COMPRA' CHECK (uso IN ('COMPRA','VENTA')),
  condicion           text NOT NULL DEFAULT 'CONTADO' CHECK (condicion IN ('CONTADO','CREDITO')),
  es_nota_credito     boolean NOT NULL DEFAULT false,
  cuenta_codigo       text,
  activo              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compra_tipos_comprobante_uk UNIQUE (empresa_id, codigo)
);

-- Los 12 tipos que mandó el cliente (captura "Tipos de comprobantes").
INSERT INTO esqueletoerp.compra_tipos_comprobante (empresa_id, codigo, nombre, uso, condicion, es_nota_credito, cuenta_codigo)
SELECT e.id, t.codigo, t.nombre, t.uso, t.condicion, t.nc, t.cuenta
FROM esqueletoerp.empresas e
CROSS JOIN (VALUES
  (1,  'COMPRA CONTADO',            'COMPRA', 'CONTADO', false, '1.01.01.02.000'),
  (2,  'COMPRA CREDITO',            'COMPRA', 'CREDITO', false, NULL),
  (3,  'VENTA CONTADO',             'VENTA',  'CONTADO', false, '1.01.01.01.000'),
  (4,  'VENTA CREDITO',             'VENTA',  'CREDITO', false, NULL),
  (5,  'CAJA CHICA CONTADO',        'COMPRA', 'CONTADO', false, '1.01.01.03.001'),
  (6,  'DESPACHO',                  'COMPRA', 'CONTADO', false, '1.01.01.02.000'),
  (7,  'VENTA CREDITO EXPORTACION', 'VENTA',  'CREDITO', false, NULL),
  (8,  'CAJA CHICA CREDITO',        'COMPRA', 'CREDITO', false, '1.01.01.03.001'),
  (9,  'FACTURA DEL EXTERIOR',      'COMPRA', 'CREDITO', false, '2.01.01.02.001'),
  (10, 'NC COMPRAS CONTADO',        'COMPRA', 'CONTADO', true,  '1.01.01.02.000'),
  (11, 'NC COMPRAS CREDITO',        'COMPRA', 'CREDITO', true,  NULL),
  (12, 'RECIBO COMUN',              'COMPRA', 'CONTADO', false, '1.01.01.02.000')
) AS t(codigo, nombre, uso, condicion, nc, cuenta)
WHERE e.id = '3c14fe00-d466-4f24-a010-1bbd7e37ccd6'
ON CONFLICT (empresa_id, codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS esqueletoerp.libro_compras_config (
  empresa_id                uuid PRIMARY KEY REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  cuenta_iva_credito        text NOT NULL DEFAULT '2.01.03.01.002',
  cuenta_proveedores        text NOT NULL DEFAULT '2.01.01.04.000',
  cuenta_retencion_iva      text,
  cuenta_retencion_renta    text,
  centro_costo_defecto      text NOT NULL DEFAULT '1.00.00',
  programa_defecto          text NOT NULL DEFAULT '1.00',
  updated_at                timestamptz NOT NULL DEFAULT now()
);
INSERT INTO esqueletoerp.libro_compras_config (empresa_id)
VALUES ('3c14fe00-d466-4f24-a010-1bbd7e37ccd6')
ON CONFLICT (empresa_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS esqueletoerp.libro_compras (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  numero_control      text NOT NULL,
  fecha               date NOT NULL,
  tipo_id             uuid REFERENCES esqueletoerp.compra_tipos_comprobante(id) ON DELETE SET NULL,
  tipo_codigo         integer NOT NULL,
  tipo_nombre         text NOT NULL,
  condicion           text NOT NULL CHECK (condicion IN ('CONTADO','CREDITO')),
  nro_comprobante     text NOT NULL,
  proveedor_id        uuid,
  proveedor_nombre    text NOT NULL,
  proveedor_ruc       text,
  timbrado            text,
  es_electronica      boolean NOT NULL DEFAULT false,
  cdc                 text,
  moneda              text NOT NULL DEFAULT 'PYG' CHECK (moneda IN ('PYG','USD','BOB')),
  cotizacion          numeric NOT NULL DEFAULT 1,
  cuotas              integer NOT NULL DEFAULT 0,
  explicacion         text,
  impacta             text NOT NULL DEFAULT 'SOLO_IVA',
  retencion_iva       numeric NOT NULL DEFAULT 0,
  retencion_renta     numeric NOT NULL DEFAULT 0,
  total_exentas       numeric NOT NULL DEFAULT 0,
  total_gravado10     numeric NOT NULL DEFAULT 0,
  total_gravado5      numeric NOT NULL DEFAULT 0,
  iva10               numeric NOT NULL DEFAULT 0,
  iva5                numeric NOT NULL DEFAULT 0,
  total               numeric NOT NULL DEFAULT 0,
  estado              text NOT NULL DEFAULT 'registrada' CHECK (estado IN ('registrada','anulada')),
  anulada_motivo      text,
  created_by_nombre   text,
  updated_by_nombre   text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT libro_compras_numero_uk UNIQUE (empresa_id, numero_control)
);
CREATE INDEX IF NOT EXISTS ix_libro_compras_fecha ON esqueletoerp.libro_compras(empresa_id, fecha DESC);
-- El mismo comprobante del mismo proveedor no se carga dos veces (salvo anulado).
CREATE UNIQUE INDEX IF NOT EXISTS libro_compras_comprobante_uq
  ON esqueletoerp.libro_compras(empresa_id, tipo_codigo, coalesce(proveedor_ruc, proveedor_nombre), coalesce(timbrado, ''), nro_comprobante)
  WHERE estado <> 'anulada';
CREATE UNIQUE INDEX IF NOT EXISTS libro_compras_cdc_uq
  ON esqueletoerp.libro_compras(empresa_id, cdc) WHERE cdc IS NOT NULL AND estado <> 'anulada';

CREATE TABLE IF NOT EXISTS esqueletoerp.libro_compras_lineas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  compra_id           uuid NOT NULL REFERENCES esqueletoerp.libro_compras(id) ON DELETE CASCADE,
  orden               integer NOT NULL DEFAULT 0,
  cuenta_codigo       text,
  centro_costo        text,
  programa            text,
  explicacion         text,
  exentas             numeric NOT NULL DEFAULT 0,
  gravadas            numeric NOT NULL DEFAULT 0,
  iva_porcentaje      integer NOT NULL DEFAULT 10 CHECK (iva_porcentaje IN (0,5,10)),
  imputa_iva          boolean NOT NULL DEFAULT true,
  formulario          text
);
CREATE INDEX IF NOT EXISTS ix_lc_lineas_compra ON esqueletoerp.libro_compras_lineas(compra_id);

CREATE TABLE IF NOT EXISTS esqueletoerp.libro_compras_cuotas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  compra_id           uuid NOT NULL REFERENCES esqueletoerp.libro_compras(id) ON DELETE CASCADE,
  nro                 integer NOT NULL,
  pagare              text,
  vencimiento         date NOT NULL,
  monto               numeric NOT NULL CHECK (monto >= 0),
  pagado              numeric NOT NULL DEFAULT 0,
  CONSTRAINT lc_cuotas_uk UNIQUE (compra_id, nro)
);

NOTIFY pgrst, 'reload schema';
