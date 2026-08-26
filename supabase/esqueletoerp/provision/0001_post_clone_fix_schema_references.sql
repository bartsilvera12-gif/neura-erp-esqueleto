-- =============================================================================
-- Esqueleto ERP — PASO 1: reapuntar TODA referencia heredada a `esqueletoerp`
-- =============================================================================
-- Tras clonar, algunos objetos pueden seguir apuntando al schema origen o a
-- schemas de otros inquilinos arrastrados en el linaje del clon
-- (instemaq -> ferrecolor -> reservacaacupe / enlodemari). Si eso queda asi:
--   . las politicas RLS de esqueletoerp evaluan tablas de OTRO inquilino, y
--   . las FKs pueden referenciar tablas de OTRO schema.
-- Ambas cosas rompen la independencia total que pide esta instancia.
--
-- Este script recorre TODO `esqueletoerp` y reescribe esas referencias al propio
-- schema. Solo emite DDL sobre objetos de `esqueletoerp`: no toca `public`,
-- `instemaq` ni ningun otro schema (las referencias a `auth.*` se preservan).
--
-- Idempotente: correrlo dos veces no cambia nada la segunda vez.
-- Requiere rol propietario de los objetos (`supabase_admin` / superusuario). Si
-- alguna sentencia da "must be owner of ...", correr este archivo con psql dentro
-- del contenedor `db` como supabase_admin.
-- =============================================================================

DO $fix$
DECLARE
  -- Schemas cuyas referencias deben reapuntarse a `esqueletoerp`.
  v_ajenos text[] := ARRAY['instemaq','ferrecolor','reservacaacupe','enlodemari','zentra_erp'];
  v_ajeno  text;
  r        record;
  v_sql    text;
  v_qual   text;
  v_check  text;
  v_cmd    text;
  v_roles  text;
  v_def    text;
  v_n      int := 0;
BEGIN
  -- ---------------------------------------------------------------------------
  -- 1) search_path de las funciones propias del schema.
  -- ---------------------------------------------------------------------------
  FOR r IN
    SELECT p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'esqueletoerp'
      AND p.proconfig IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM unnest(p.proconfig) cfg
        WHERE cfg LIKE 'search_path=%' AND cfg NOT LIKE '%esqueletoerp%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION esqueletoerp.%I(%s) SET search_path TO %L',
                   r.proname, r.args, 'esqueletoerp');
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE '1) search_path reapuntado en % funciones', v_n;

  -- ---------------------------------------------------------------------------
  -- 2) Cuerpos de funciones que citan un schema ajeno de forma calificada.
  -- ---------------------------------------------------------------------------
  v_n := 0;
  FOREACH v_ajeno IN ARRAY v_ajenos LOOP
    FOR r IN
      SELECT p.oid, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'esqueletoerp'
        AND p.prokind = 'f'
        AND pg_get_functiondef(p.oid) ~ ('\m' || v_ajeno || '\.')
    LOOP
      v_def := pg_get_functiondef(r.oid);
      v_def := regexp_replace(v_def, '\m' || v_ajeno || '\.', 'esqueletoerp.', 'g');
      EXECUTE v_def;
      v_n := v_n + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE '2) cuerpo reescrito en % funciones', v_n;

  -- ---------------------------------------------------------------------------
  -- 3) Politicas RLS que invocan funciones o leen tablas de un schema ajeno.
  --    Se recrean identicas (mismo nombre, comando, roles y permisividad),
  --    cambiando unicamente el schema calificador.
  -- ---------------------------------------------------------------------------
  v_n := 0;
  FOR r IN
    SELECT c.relname AS tbl,
           p.polname AS pol,
           p.polcmd,
           p.polpermissive,
           pg_get_expr(p.polqual,      p.polrelid) AS qual,
           pg_get_expr(p.polwithcheck, p.polrelid) AS wcheck,
           CASE
             WHEN p.polroles = '{0}'::oid[] THEN 'PUBLIC'
             ELSE (SELECT string_agg(quote_ident(ro.rolname), ', ' ORDER BY ro.rolname)
                     FROM pg_roles ro WHERE ro.oid = ANY (p.polroles))
           END AS roles
    FROM pg_policy p
    JOIN pg_class     c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'esqueletoerp'
      AND EXISTS (
        SELECT 1 FROM unnest(v_ajenos) a
        WHERE coalesce(pg_get_expr(p.polqual, p.polrelid), '')      ~ ('\m' || a || '\.')
           OR coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ ('\m' || a || '\.')
      )
  LOOP
    v_qual  := coalesce(r.qual, '');
    v_check := coalesce(r.wcheck, '');
    FOREACH v_ajeno IN ARRAY v_ajenos LOOP
      v_qual  := regexp_replace(v_qual,  '\m' || v_ajeno || '\.', 'esqueletoerp.', 'g');
      v_check := regexp_replace(v_check, '\m' || v_ajeno || '\.', 'esqueletoerp.', 'g');
    END LOOP;

    v_cmd := CASE r.polcmd
               WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
               WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
               ELSE 'ALL'
             END;
    v_roles := coalesce(r.roles, 'PUBLIC');

    EXECUTE format('DROP POLICY IF EXISTS %I ON esqueletoerp.%I', r.pol, r.tbl);

    v_sql := format('CREATE POLICY %I ON esqueletoerp.%I AS %s FOR %s TO %s',
                    r.pol, r.tbl,
                    CASE WHEN r.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                    v_cmd, v_roles);
    IF nullif(v_qual, '')  IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_qual); END IF;
    IF nullif(v_check, '') IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check); END IF;
    EXECUTE v_sql;
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE '3) % politicas RLS reapuntadas a esqueletoerp', v_n;

  -- ---------------------------------------------------------------------------
  -- 4) Foreign keys que apuntan a tablas de OTRO schema.
  --    Se recrean contra la tabla homonima de `esqueletoerp` (que existe, porque
  --    el clon es estructuralmente identico). Las FKs hacia `auth.*` se conservan.
  -- ---------------------------------------------------------------------------
  v_n := 0;
  FOR r IN
    SELECT con.conname,
           cl.relname  AS tbl,
           nf.nspname  AS ref_schema,
           clf.relname AS ref_tbl,
           pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class     cl  ON cl.oid  = con.conrelid
    JOIN pg_namespace n   ON n.oid   = cl.relnamespace
    JOIN pg_class     clf ON clf.oid = con.confrelid
    JOIN pg_namespace nf  ON nf.oid  = clf.relnamespace
    WHERE con.contype = 'f'
      AND n.nspname   = 'esqueletoerp'
      AND nf.nspname <> 'esqueletoerp'
      AND nf.nspname <> 'auth'
      AND EXISTS (
        SELECT 1 FROM pg_class c2 JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
        WHERE n2.nspname = 'esqueletoerp' AND c2.relname = clf.relname
      )
  LOOP
    v_def := regexp_replace(r.def,
              'REFERENCES\s+' || r.ref_schema || '\.',
              'REFERENCES esqueletoerp.', 'g');
    EXECUTE format('ALTER TABLE esqueletoerp.%I DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('ALTER TABLE esqueletoerp.%I ADD CONSTRAINT %I %s', r.tbl, r.conname, v_def);
    v_n := v_n + 1;
    RAISE NOTICE '   FK % en tabla %: apuntaba a %.%', r.conname, r.tbl, r.ref_schema, r.ref_tbl;
  END LOOP;
  RAISE NOTICE '4) % foreign keys reapuntadas a esqueletoerp', v_n;
END
$fix$;

-- -----------------------------------------------------------------------------
-- Guard heredado de otro inquilino (hardcodea el UUID de la empresa enlodemari).
-- No esta asociado a ningun trigger aca; se elimina para no arrastrar el hardcode.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS esqueletoerp.neura_enlodemari_block_other_empresas();

-- -----------------------------------------------------------------------------
-- VERIFICACION — las tres consultas deben devolver 0 filas.
-- -----------------------------------------------------------------------------

-- 1. Politicas que todavia citan otro schema:
SELECT c.relname AS tabla, p.polname AS politica,
       pg_get_expr(p.polqual, p.polrelid) AS using_expr
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'esqueletoerp'
  AND (coalesce(pg_get_expr(p.polqual,p.polrelid),'') ~ '\m(instemaq|ferrecolor|reservacaacupe|enlodemari|zentra_erp)\.'
    OR coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') ~ '\m(instemaq|ferrecolor|reservacaacupe|enlodemari|zentra_erp)\.');

-- 2. Funciones que todavia citan otro schema:
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'esqueletoerp'
  AND pg_get_functiondef(p.oid) ~ '\m(instemaq|ferrecolor|reservacaacupe|enlodemari|zentra_erp)\.';

-- 3. FKs que todavia apuntan fuera de esqueletoerp (auth.* es esperado y NO aparece):
SELECT cl.relname AS tabla, con.conname, nf.nspname AS apunta_a
FROM pg_constraint con
JOIN pg_class cl ON cl.oid = con.conrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
JOIN pg_class clf ON clf.oid = con.confrelid
JOIN pg_namespace nf ON nf.oid = clf.relnamespace
WHERE con.contype = 'f' AND n.nspname = 'esqueletoerp'
  AND nf.nspname NOT IN ('esqueletoerp','auth');
