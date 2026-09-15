-- =============================================================================
-- Esqueleto ERP — PASO 4: modulos habilitados para la empresa
-- =============================================================================
-- Deja activos los modulos base + los modulos ya construidos en el repo que se
-- reactivaron para esta instancia (alcance ampliado tras el relevamiento
-- funcional de 2026-09).
--
-- Cualquier otra ruta del repo queda bloqueada por AuthGuard: con
-- NEURA_INSTANCE_MODE=single_client la app aplica allowlist estricta
-- (`strictAllowlist`) y `empresa_modulos` es la unica fuente de verdad.
--
-- Replica el comportamiento del guardado de la app (admin/empresas/[id]):
-- DELETE de empresa_modulos + INSERT de los seleccionados con activo=true.
-- Idempotente (siempre deja exactamente estos modulos).
--
-- NOTA: `resolveEffectiveModules` hace fallback a "ERP completo" si NO hay filas
-- activas; por eso nunca hay que dejar la tabla vacia para esta empresa.
--
-- Solo escribe en `esqueletoerp`.
-- =============================================================================

DO $mod$
DECLARE
  v_empresa_id uuid := '3c14fe00-d466-4f24-a010-1bbd7e37ccd6';
  -- Alcance segun Requerimientos_Funcionales_Programacion_v2.pdf:
  --   base 6 + los modulos ya construidos que el documento pide destapar
  --   (Remisiones, Recibos, Clientes, Gastos, Cobros/Pagos, CRM, Gestion de
  --   clientes, Proyectos) + Configuracion.
  v_slugs text[] := ARRAY[
    -- Base (6 originales)
    'dashboard',
    'ventas',              -- Caja / punto de venta
    'inventario',
    'compras',
    'presupuestos',
    'reportes',
    -- PDF §1 documentos comerciales
    'remision',            -- Notas de remision
    'recibos',
    -- PDF §6 CRM + historial por cliente
    'clientes',
    'crm',
    'gestion-clientes',
    -- PDF §2 caja/fondos
    'gastos',
    'cobros',              -- pagos a proveedor (ruta /pagos)
    'proyectos',           -- fondos por proyecto
    -- PDF §4 contabilidad (plan de cuentas, libro diario/mayor, conciliacion)
    'contabilidad',
    -- Config general
    'configuracion'
  ];
  v_faltan text[];
BEGIN
  SELECT array_agg(s) INTO v_faltan
  FROM unnest(v_slugs) s
  WHERE NOT EXISTS (SELECT 1 FROM esqueletoerp.modulos m WHERE m.slug = s);

  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan estos slugs en esqueletoerp.modulos: %. Corre antes el paso 3 (0003_master_data.sql).', v_faltan;
  END IF;

  DELETE FROM esqueletoerp.empresa_modulos WHERE empresa_id = v_empresa_id;

  INSERT INTO esqueletoerp.empresa_modulos (empresa_id, modulo_id, activo)
  SELECT v_empresa_id, m.id, true
  FROM esqueletoerp.modulos m
  WHERE m.slug = ANY (v_slugs);

  RAISE NOTICE 'empresa_modulos Esqueleto ERP: % modulos activos',
    (SELECT count(*) FROM esqueletoerp.empresa_modulos WHERE empresa_id = v_empresa_id AND activo);
END
$mod$;

-- Verificacion: listado completo de modulos activos para la empresa.
SELECT m.slug, m.nombre, em.activo
FROM esqueletoerp.empresa_modulos em
JOIN esqueletoerp.modulos m ON m.id = em.modulo_id
WHERE em.empresa_id = '3c14fe00-d466-4f24-a010-1bbd7e37ccd6'
ORDER BY m.slug;
