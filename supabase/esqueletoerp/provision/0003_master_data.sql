-- =============================================================================
-- Esqueleto ERP — PASO 3: datos maestros minimos (empresa propia + catalogos)
-- =============================================================================
-- Idempotente. Requiere que el schema `esqueletoerp` YA exista con la estructura
-- clonada (paso 0) y reapuntada (paso 1).
--
-- SOLO inserta catalogos estructurales y la empresa propia. NO copia datos
-- operativos (clientes, productos, stock, compras, presupuestos, facturas,
-- pagos, proveedores, usuarios, tokens, certificados, etc.): esas tablas quedan
-- vacias, como pidio el negocio.
--
-- Empresa Esqueleto ERP (UUID propio, distinto del de cualquier otra instancia):
--     3c14fe00-d466-4f24-a010-1bbd7e37ccd6
--
-- Solo escribe en `esqueletoerp`. No toca `public` ni ningun otro schema.
-- =============================================================================

DO $seed$
DECLARE
  v_empresa_id uuid := '3c14fe00-d466-4f24-a010-1bbd7e37ccd6';
BEGIN
  -- ---------------------------------------------------------------------------
  -- 1) Empresa propia (unica empresa operativa del schema esqueletoerp).
  -- ---------------------------------------------------------------------------
  INSERT INTO esqueletoerp.empresas (id, nombre_empresa, pais, estado, data_schema, gestion_tributaria_clientes)
  VALUES (v_empresa_id, 'Esqueleto ERP', 'PARAGUAY', 'activo', 'esqueletoerp', false)
  ON CONFLICT (id) DO NOTHING;

  -- ---------------------------------------------------------------------------
  -- 2) Catalogo global de modulos (sin empresa_id).
  --    Se conserva el catalogo completo para que la app pueda resolver cualquier
  --    slug por FK; que un modulo APAREZCA en el ERP lo decide `empresa_modulos`
  --    (paso 4), no este catalogo.
  --    `Caja` es el modulo `ventas` renombrado; `reportes` ya existia en el catalogo.
  -- ---------------------------------------------------------------------------
  INSERT INTO esqueletoerp.modulos (id, nombre, slug, descripcion) VALUES
    ('7cb297a1-b49b-4ef5-9777-09f4518402a1','Dashboard','dashboard',NULL),
    -- Caja = el modulo Ventas del ERP (punto de venta). Mismo slug y mismas rutas
    -- que en Instemaq; solo se renombra la etiqueta a "Caja".
    ('3a1a6701-f6c5-48fd-b599-c6f88bc48374','Caja','ventas','Caja / punto de venta'),
    ('569781c8-7e1d-4ac9-b240-e7bb82a0b83b','Inventario','inventario',NULL),
    ('aea02686-46a2-4448-a9b3-fe83b4a03491','Compras','compras',NULL),
    ('3f4b07ed-668d-4f86-917f-d354329b5fc3','Presupuestos','presupuestos','Presupuestos / cotizaciones comerciales'),
    ('e22671a3-2a8d-4478-9916-3b037f87c592','Reportes','reportes','Reporteria operativa (estado de cuenta, proveedores)'),
    ('f497bf2a-d650-460a-b5ab-f72018fed47b','Gastos','gastos',NULL),
    ('de613097-35c8-4b05-be53-bc6bde5d5f0b','Pagos','pagos',NULL),
    ('98d53199-0259-4ade-9dbc-e8f67918305c','Marketing Ops','marketing',NULL),
    ('c0f676ac-d879-48b2-a78a-6db59fabb100','Sorteos','sorteos',NULL),
    ('3cb40f93-1aed-4bcc-a800-a1b4ecabc0fe','Conversaciones','conversaciones',NULL),
    ('3b6391bb-e77a-464b-84ea-1f95884cffc3','Clientes','clientes',NULL),
    ('1a9717b9-8a8e-42f3-b46b-a9e559543d8b','Usuarios','usuarios',NULL),
    ('96f10ea8-a801-41a6-951f-83b7fcf5a0ab','Configuracion','configuracion',NULL),
    ('2f0b9c7b-965b-4c70-8480-53442cdd41fc','Planes','planes',NULL),
    ('63025c6b-8417-4b9a-8f1c-034002279778','Gestion Clientes','gestion-clientes',NULL),
    ('e59cc5a3-5f7c-4a6c-afe2-d7f1a67fe602','CRM Funnel','crm',NULL),
    ('1d917292-2e2e-4c9f-9615-4565b3b51dd9','Notas de credito','notas_credito',NULL),
    ('4b6bdaf2-1790-424d-bb80-b404235ddd49','Historial omnicanal','historial-omnicanal',NULL),
    ('914f9f31-b968-4de6-907f-2a1281a8d5fc','Conversaciones finalizadas','conversaciones-finalizadas',NULL),
    ('ea66f279-2861-4835-8cec-1228e12f64ff','Monitoreo','monitoreo',NULL),
    ('80b7c821-5b12-4802-a7ed-2dd2c3d972d3','Omnicanal (paquete)','omnicanal',NULL),
    ('d6e12622-7178-4d19-8277-bb974e238faf','Campanas WhatsApp','campanas',NULL),
    ('dc402405-7428-4770-9573-2a45321aaaba','Proyectos','proyectos',NULL),
    ('49abab54-4d2b-40a3-8feb-131e2430e764','Marketing Ops','marketing_ops',NULL),
    ('e09e242b-2975-47d5-a4d5-42398e013641','Comisiones','comisiones',NULL),
    ('19f4f4cd-ee2a-41cf-a8a9-5930e8703fd2','Recetas','recetas','Recetas y costeo de productos'),
    ('3bcaff06-0785-47fd-bf7a-a3721d421b10','Cobros','cobros','Cuentas por cobrar y cobros de clientes'),
    ('572e2dce-e43e-4b3c-aa01-9ddd86358c3e','Recibos','recibos','Recibos de dinero (comprobante interno no fiscal)'),
    ('97b5b2f8-4d14-4a0e-8890-712f7a229046','Remision','remision','Notas de remision (traslado de mercaderia)')
  ON CONFLICT (id) DO NOTHING;

  -- ---------------------------------------------------------------------------
  -- 3) Catalogo global de vistas de dashboard (sin empresa_id).
  -- ---------------------------------------------------------------------------
  INSERT INTO esqueletoerp.dashboard_views (id, slug, nombre, orden, activo) VALUES
    ('2c64c937-5537-4550-b846-94345fbc8583','comercial','Comercial',10,true),
    ('c53eec08-84a9-4e5e-a656-74b8a2fc8e44','financiero','Financiero',20,true),
    ('87f0e8f7-7bda-4d72-9c51-8e45363fa5ba','inventario','Inventario',30,true),
    ('76e2b19c-2f47-4306-a8ce-da9162910f1f','ventas','Ventas',40,true)
  ON CONFLICT (id) DO NOTHING;

  -- ---------------------------------------------------------------------------
  -- 4) empresa_dashboard_views — asigna las vistas del dashboard a la empresa.
  -- ---------------------------------------------------------------------------
  INSERT INTO esqueletoerp.empresa_dashboard_views (empresa_id, dashboard_view_id, activo)
  SELECT v_empresa_id, dv.id, true
  FROM esqueletoerp.dashboard_views dv
  WHERE NOT EXISTS (
    SELECT 1 FROM esqueletoerp.empresa_dashboard_views edv
    WHERE edv.empresa_id = v_empresa_id AND edv.dashboard_view_id = dv.id
  );

  -- ---------------------------------------------------------------------------
  -- 5) crm_etapas — etapas de pipeline por defecto (estados predeterminados).
  -- ---------------------------------------------------------------------------
  INSERT INTO esqueletoerp.crm_etapas (empresa_id, codigo, nombre, color, orden, activo)
  SELECT v_empresa_id, x.codigo, x.nombre, x.color, x.orden, true
  FROM (VALUES
    ('LEAD','Lead','gray',1),
    ('CONTACTADO','Contactado','blue',2),
    ('NEGOCIACION','Negociacion','amber',3),
    ('GANADO','Ganado','green',4),
    ('PERDIDO','Perdido','red',5)
  ) AS x(codigo, nombre, color, orden)
  WHERE NOT EXISTS (
    SELECT 1 FROM esqueletoerp.crm_etapas e
    WHERE e.empresa_id = v_empresa_id AND e.codigo = x.codigo
  );

  -- ---------------------------------------------------------------------------
  -- 6) cliente_tipos_servicio_catalogo — tipos de servicio del sistema.
  -- ---------------------------------------------------------------------------
  INSERT INTO esqueletoerp.cliente_tipos_servicio_catalogo (empresa_id, slug, nombre, activo, orden, es_sistema)
  SELECT v_empresa_id, x.slug, x.nombre, true, x.orden, true
  FROM (VALUES
    ('marketing','Marketing',10),
    ('saas','SaaS',20),
    ('branding','Branding',30),
    ('web','Web',40),
    ('otro','Otro',50)
  ) AS x(slug, nombre, orden)
  WHERE NOT EXISTS (
    SELECT 1 FROM esqueletoerp.cliente_tipos_servicio_catalogo t
    WHERE t.empresa_id = v_empresa_id AND t.slug = x.slug
  );

  RAISE NOTICE 'Provision Esqueleto ERP completada para empresa_id=%', v_empresa_id;
END
$seed$;
