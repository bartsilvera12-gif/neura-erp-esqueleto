-- =============================================================================
-- Esqueleto ERP — PASO 5: usuario administrador  admin@erpesqueleto.com
-- =============================================================================
-- REQUISITO PREVIO (fuera de este script, en la UI de Supabase):
--
--   Studio -> Authentication -> Users -> "Add user" -> "Create new user"
--     Email:          admin@erpesqueleto.com
--     Password:       (la que definas)
--     Auto Confirm User:  SI  (si no, no puede loguear hasta confirmar el mail)
--
-- No se inventa el `auth_user_id`: este script lo BUSCA por email en auth.users.
-- Si el usuario de Auth todavia no existe, aborta con un mensaje claro.
--
-- Rol `admin` (NO `super_admin`) a proposito: `resolveEffectiveModules` le da a
-- un admin de empresa todos los modulos ACTIVOS en `empresa_modulos` — es decir,
-- exactamente los 6 del paso 4. Un `super_admin`, en cambio, saltea el gate y
-- veria el catalogo COMPLETO, que no es lo pedido.
--
-- Solo escribe en `esqueletoerp.usuarios`. Lee `auth.users` pero no la modifica.
-- Idempotente.
-- =============================================================================

DO $usr$
DECLARE
  v_empresa_id uuid := '3c14fe00-d466-4f24-a010-1bbd7e37ccd6';
  v_email      text := 'admin@erpesqueleto.com';
  v_auth_id    uuid;
BEGIN
  SELECT u.id INTO v_auth_id
  FROM auth.users u
  WHERE lower(u.email) = lower(v_email)
  LIMIT 1;

  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION
      'No existe % en auth.users. Crealo primero en Studio -> Authentication -> Users -> Add user (con Auto Confirm User activado) y volve a correr este script.',
      v_email;
  END IF;

  INSERT INTO esqueletoerp.usuarios (id, email, nombre, rol, empresa_id, auth_user_id, activo)
  VALUES (gen_random_uuid(), v_email, 'Administrador', 'admin', v_empresa_id, v_auth_id, true)
  ON CONFLICT DO NOTHING;

  -- Si la fila ya existia (de una corrida previa), la realinea.
  UPDATE esqueletoerp.usuarios
     SET nombre       = 'Administrador',
         rol          = 'admin',
         empresa_id   = v_empresa_id,
         auth_user_id = v_auth_id,
         activo       = true
   WHERE lower(email) = lower(v_email);

  RAISE NOTICE 'Usuario % vinculado a auth_user_id=% en empresa %', v_email, v_auth_id, v_empresa_id;
END
$usr$;

-- Verificacion: debe devolver 1 fila con rol=admin, activo=true y auth_user_id no nulo.
SELECT id, email, nombre, rol, empresa_id, auth_user_id, activo
FROM esqueletoerp.usuarios
WHERE lower(email) = 'admin@erpesqueleto.com';
