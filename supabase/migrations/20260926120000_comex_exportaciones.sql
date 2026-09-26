-- =============================================================================
-- Comercio Exterior · Exportaciones operativas (PDF "Comercio Exterior,
-- Inventario y Control Operativo" §5 y §8). Solo esqueletoerp (base compartida).
--
--   exportaciones            el envío: cliente, destino, responsable, fechas,
--                            vínculo con su factura y su nota de remisión,
--                            regla de proforma (Sarasota)
--   exportacion_items        productos y cantidades
--   exportacion_checklist    control previo al despacho (quién y cuándo)
--   comex_contenedores       + FK exportacion_id
--
-- La factura fiscal sigue en facturas_exportacion: acá solo se vincula.
-- Aditiva e idempotente. No toca stock.
-- =============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS esqueletoerp.exportaciones (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                    uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  numero                        text NOT NULL,
  cliente_id                    uuid,
  cliente_nombre                text NOT NULL,
  pais_destino                  text NOT NULL,
  productor                     text,
  factura_id                    uuid REFERENCES esqueletoerp.facturas_exportacion(id) ON DELETE SET NULL,
  nota_remision_id              uuid,
  requiere_proforma             boolean NOT NULL DEFAULT true,
  motivo_sin_proforma           text,
  estado                        text NOT NULL DEFAULT 'preparacion'
                                CHECK (estado IN ('preparacion','documentacion','aprobada','despachada','entregada','cerrada','anulada')),
  responsable_id                uuid,
  responsable_nombre            text NOT NULL,
  fecha_comprometida_embarque   date,
  fecha_comprometida_entrega    date,
  fecha_embarque                date,
  fecha_entrega                 date,
  aprobada_por_nombre           text,
  aprobada_at                   timestamptz,
  observaciones                 text,
  anulada_motivo                text,
  created_by_nombre             text,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exportaciones_numero_uk UNIQUE (empresa_id, numero)
);
CREATE INDEX IF NOT EXISTS ix_exportaciones_empresa_estado ON esqueletoerp.exportaciones(empresa_id, estado);
-- Una factura y una nota de remisión pertenecen a un solo envío.
CREATE UNIQUE INDEX IF NOT EXISTS exportaciones_factura_uq ON esqueletoerp.exportaciones(factura_id) WHERE factura_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS exportaciones_nr_uq ON esqueletoerp.exportaciones(nota_remision_id) WHERE nota_remision_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS esqueletoerp.exportacion_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  exportacion_id   uuid NOT NULL REFERENCES esqueletoerp.exportaciones(id) ON DELETE CASCADE,
  producto_id      uuid REFERENCES esqueletoerp.productos(id) ON DELETE SET NULL,
  producto_nombre  text NOT NULL,
  sku              text,
  cantidad         numeric NOT NULL CHECK (cantidad > 0),
  contenedor_id    uuid REFERENCES esqueletoerp.comex_contenedores(id) ON DELETE SET NULL,
  observacion      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_exp_items_exp ON esqueletoerp.exportacion_items(exportacion_id);

CREATE TABLE IF NOT EXISTS esqueletoerp.exportacion_checklist (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL REFERENCES esqueletoerp.empresas(id) ON DELETE CASCADE,
  exportacion_id   uuid NOT NULL REFERENCES esqueletoerp.exportaciones(id) ON DELETE CASCADE,
  item             text NOT NULL,
  ok               boolean NOT NULL DEFAULT false,
  observacion      text,
  usuario_id       uuid,
  usuario_nombre   text,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exportacion_checklist_uk UNIQUE (exportacion_id, item)
);

DO $$
BEGIN
  ALTER TABLE esqueletoerp.comex_contenedores
    ADD CONSTRAINT comex_contenedores_exportacion_fkey
    FOREIGN KEY (exportacion_id) REFERENCES esqueletoerp.exportaciones(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS ix_comex_cont_exportacion ON esqueletoerp.comex_contenedores(exportacion_id);

NOTIFY pgrst, 'reload schema';
