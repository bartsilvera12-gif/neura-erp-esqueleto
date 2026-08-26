-- =============================================================================
-- Esqueleto ERP — PASO 0: clonar la ESTRUCTURA del schema `instemaq`
-- =============================================================================
-- Crea el schema `esqueletoerp` como copia EXACTA de `instemaq` en estructura
-- (tablas, columnas, tipos, defaults, constraints, índices, secuencias, vistas,
-- funciones, triggers, políticas RLS) y SIN NINGÚN DATO de las tablas.
--
-- Aislamiento: solo escribe dentro de `esqueletoerp`. No modifica `public`,
-- `instemaq` ni ningún otro schema. La función `public.neura_clone_schema_full`
-- ya existe en esta base (es la que se usó para crear `instemaq` desde
-- `ferrecolor`); acá solo se INVOCA, no se altera.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente por el guard de abajo:
-- si `esqueletoerp` ya existe, aborta sin tocar nada.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'esqueletoerp') THEN
    RAISE EXCEPTION 'El schema esqueletoerp ya existe. Abortado para no pisar nada. Si querés rehacerlo desde cero, borralo a mano primero (DROP SCHEMA esqueletoerp CASCADE) y volvé a correr este script.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'instemaq') THEN
    RAISE EXCEPTION 'No existe el schema origen `instemaq` en esta base.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'neura_clone_schema_full'
  ) THEN
    RAISE EXCEPTION 'No existe public.neura_clone_schema_full(). Es la función que se usó para crear instemaq desde ferrecolor; sin ella no se puede clonar por SQL Editor.';
  END IF;
END $$;

-- El tercer argumento `false` = clonar SOLO estructura, sin copiar filas.
SELECT public.neura_clone_schema_full('instemaq', 'esqueletoerp', false);

-- Comprobación rápida: cantidad de tablas clonadas y total de filas (debe ser 0).
SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'instemaq')      AS tablas_instemaq,
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'esqueletoerp')  AS tablas_esqueletoerp;
