-- =============================================================================
-- Esqueleto ERP — PASO 2: permisos del rol `anon` sobre el schema propio
-- =============================================================================
-- El clonador (neura_clone_schema_full) otorga privilegios a `authenticated` y
-- `service_role`, pero NO a `anon`. La app usa el rol `anon` en rutas publicas
-- (browser sin sesion); sin estos grants PostgREST responde 401 / 42501
-- "permission denied".
--
-- Seguridad: NO afecta el aislamiento — las politicas RLS de esqueletoerp
-- (reapuntadas en el paso 1) siguen filtrando fila por fila.
--
-- Solo toca el schema `esqueletoerp`. Idempotente.
--
-- IMPORTANTE: si las tablas son propiedad de `supabase_admin`, el rol `postgres`
-- (no superusuario, sin GRANT OPTION) ejecuta estos GRANT sin error pero sin
-- efecto ("no privileges were granted"). En ese caso aplicar con conexion
-- `supabase_admin` / superusuario (psql dentro del contenedor `db`).
-- =============================================================================

GRANT USAGE  ON SCHEMA esqueletoerp TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES     IN SCHEMA esqueletoerp TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES  IN SCHEMA esqueletoerp TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA esqueletoerp TO anon, authenticated, service_role;

-- Objetos creados a futuro dentro del schema.
ALTER DEFAULT PRIVILEGES IN SCHEMA esqueletoerp
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA esqueletoerp
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA esqueletoerp
  GRANT EXECUTE ON ROUTINES TO anon, authenticated, service_role;
