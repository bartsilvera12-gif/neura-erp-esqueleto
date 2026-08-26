-- =============================================================================
-- Esqueleto ERP — PASO 6: entidades de cobro iniciales
-- =============================================================================
-- Necesarias para operar Caja / cobros con transferencia o tarjeta: el ERP exige
-- elegir una entidad de esta lista. Renombrables o ampliables desde la app.
--
-- Solo escribe en `esqueletoerp`. Idempotente.
-- =============================================================================

INSERT INTO esqueletoerp.entidades_bancarias (empresa_id, nombre, tipo, activo, orden)
SELECT '3c14fe00-d466-4f24-a010-1bbd7e37ccd6', x.nombre, x.tipo, true, x.orden
FROM (VALUES
  ('Caja',             'caja',      10),
  ('Banco Itau',       'banco',     20),
  ('Banco Continental','banco',     30),
  ('Ueno Bank',        'banco',     40),
  ('POS / Tarjeta',    'tarjeta',   50),
  ('Billetera',        'billetera', 60)
) AS x(nombre, tipo, orden)
WHERE NOT EXISTS (
  SELECT 1 FROM esqueletoerp.entidades_bancarias e
  WHERE e.empresa_id = '3c14fe00-d466-4f24-a010-1bbd7e37ccd6'
    AND lower(e.nombre) = lower(x.nombre)
);

SELECT nombre, tipo, orden, activo
FROM esqueletoerp.entidades_bancarias
WHERE empresa_id = '3c14fe00-d466-4f24-a010-1bbd7e37ccd6'
ORDER BY orden;
