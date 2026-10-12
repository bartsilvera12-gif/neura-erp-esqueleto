-- =============================================================================
-- Inventario · DEPÓSITO PREDETERMINADO + "Almacén Mariano Roque"
-- El cliente (Living Room) quiere que los productos nuevos entren por defecto a
-- un almacén ("Almacén Mariano Roque"). Se agrega una marca es_predeterminado
-- (un depósito por empresa) y se crea ese depósito como predeterminado.
-- Solo admin cambia cuál es el predeterminado (desde la app).
--
-- Solo esqueletoerp (base compartida con otros clientes).
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

ALTER TABLE esqueletoerp.inventario_ubicaciones
  ADD COLUMN IF NOT EXISTS es_predeterminado boolean NOT NULL DEFAULT false;

-- Un solo depósito predeterminado por empresa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ubicaciones_predeterminada
  ON esqueletoerp.inventario_ubicaciones (empresa_id)
  WHERE es_predeterminado;

-- 1) Si YA existe un depósito "Mariano Roque" (p.ej. "ALMACEN MARIANO ROQUE"),
--    marcarlo como predeterminado (uno por empresa, solo si aún no hay uno).
--    Match por nombre normalizado (sin acentos, tolerante a mayúsculas/espacios).
UPDATE esqueletoerp.inventario_ubicaciones u
   SET es_predeterminado = true
 WHERE u.id = (
         SELECT u2.id FROM esqueletoerp.inventario_ubicaciones u2
          WHERE u2.empresa_id = u.empresa_id
            AND translate(lower(trim(u2.nombre)), 'áéíóúñ', 'aeioun') ~ 'mariano +roque'
          ORDER BY u2.created_at NULLS LAST, u2.id
          LIMIT 1
       )
   AND NOT EXISTS (
         SELECT 1 FROM esqueletoerp.inventario_ubicaciones ud
          WHERE ud.empresa_id = u.empresa_id AND ud.es_predeterminado
       );

-- 2) Crear "Almacén Mariano Roque" (Paraguay) SOLO para empresas que todavía NO
--    tengan un depósito con ese nombre. Queda predeterminado si aún no hay uno.
INSERT INTO esqueletoerp.inventario_ubicaciones
  (empresa_id, nombre, codigo, tipo, pais, activo, es_predeterminado)
SELECT DISTINCT p.empresa_id,
       'Almacén Mariano Roque', 'MARIANO_ROQUE', 'deposito', 'PY', true,
       NOT EXISTS (
         SELECT 1 FROM esqueletoerp.inventario_ubicaciones u2
         WHERE u2.empresa_id = p.empresa_id AND u2.es_predeterminado
       )
FROM esqueletoerp.productos p
WHERE NOT EXISTS (
  SELECT 1 FROM esqueletoerp.inventario_ubicaciones u
  WHERE u.empresa_id = p.empresa_id
    AND translate(lower(trim(u.nombre)), 'áéíóúñ', 'aeioun') ~ 'mariano +roque'
);

COMMIT;

NOTIFY pgrst, 'reload schema';
