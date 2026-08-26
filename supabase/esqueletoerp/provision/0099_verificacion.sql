-- =============================================================================
-- Esqueleto ERP — VERIFICACION final (solo lectura, no modifica nada)
-- =============================================================================
-- Correr despues de los pasos 0 a 6 y de exponer el schema en PostgREST.
-- =============================================================================

-- A) El clon quedo estructuralmente identico a instemaq.
SELECT 'tablas'   AS objeto,
       (SELECT count(*) FROM pg_tables   WHERE schemaname='instemaq')     AS instemaq,
       (SELECT count(*) FROM pg_tables   WHERE schemaname='esqueletoerp') AS esqueletoerp
UNION ALL
SELECT 'vistas',
       (SELECT count(*) FROM pg_views    WHERE schemaname='instemaq'),
       (SELECT count(*) FROM pg_views    WHERE schemaname='esqueletoerp')
UNION ALL
SELECT 'funciones',
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='instemaq'),
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='esqueletoerp')
UNION ALL
SELECT 'politicas rls',
       (SELECT count(*) FROM pg_policies WHERE schemaname='instemaq'),
       (SELECT count(*) FROM pg_policies WHERE schemaname='esqueletoerp')
UNION ALL
SELECT 'indices',
       (SELECT count(*) FROM pg_indexes  WHERE schemaname='instemaq'),
       (SELECT count(*) FROM pg_indexes  WHERE schemaname='esqueletoerp');

-- B) Tablas del clon que NO deberian tener datos.
--    Solo deberian aparecer con filas: empresas(1), modulos(31), dashboard_views(4),
--    empresa_modulos(6), empresa_dashboard_views(4), crm_etapas(5),
--    cliente_tipos_servicio_catalogo(5), entidades_bancarias(6), usuarios(1).
SELECT c.relname AS tabla, c.reltuples::bigint AS filas_aprox
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'esqueletoerp' AND c.relkind = 'r' AND c.reltuples > 0
ORDER BY c.reltuples DESC;
-- (si reltuples viene en -1, corre antes:  ANALYZE;  limitado a este schema no
--  es posible en SQL Editor, asi que usa el conteo puntual de la tabla que dudes)

-- C) Independencia: 0 filas en las tres consultas.
SELECT 'politica cruzada' AS problema, c.relname AS tabla, p.polname AS objeto
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='esqueletoerp'
  AND (coalesce(pg_get_expr(p.polqual,p.polrelid),'') ~ '\m(instemaq|ferrecolor|reservacaacupe|enlodemari|zentra_erp)\.'
    OR coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') ~ '\m(instemaq|ferrecolor|reservacaacupe|enlodemari|zentra_erp)\.')
UNION ALL
SELECT 'funcion cruzada', p.proname, p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='esqueletoerp'
  AND pg_get_functiondef(p.oid) ~ '\m(instemaq|ferrecolor|reservacaacupe|enlodemari|zentra_erp)\.'
UNION ALL
SELECT 'fk cruzada', cl.relname, con.conname
FROM pg_constraint con
JOIN pg_class cl ON cl.oid=con.conrelid
JOIN pg_namespace n ON n.oid=cl.relnamespace
JOIN pg_class clf ON clf.oid=con.confrelid
JOIN pg_namespace nf ON nf.oid=clf.relnamespace
WHERE con.contype='f' AND n.nspname='esqueletoerp' AND nf.nspname NOT IN ('esqueletoerp','auth');

-- D) Empresa, modulos habilitados y usuario admin.
SELECT id, nombre_empresa, data_schema, estado FROM esqueletoerp.empresas;

SELECT m.slug, m.nombre, em.activo
FROM esqueletoerp.empresa_modulos em
JOIN esqueletoerp.modulos m ON m.id = em.modulo_id
WHERE em.empresa_id = '3c14fe00-d466-4f24-a010-1bbd7e37ccd6'
ORDER BY m.slug;

SELECT email, rol, activo, auth_user_id IS NOT NULL AS vinculado_a_auth
FROM esqueletoerp.usuarios;

-- E) PostgREST expone el schema (esto NO lo hace SQL: es el paso manual de
--    exposicion). Comprobacion desde la VPS:
--      cd /root/supabase/docker && ./exponer-schema.sh esqueletoerp
--    y luego:
--      curl -s -o /dev/null -w "%{http_code}\n" \
--        -H "apikey: $ANON_KEY" -H "Accept-Profile: esqueletoerp" \
--        "https://api.neura.com.py/rest/v1/empresas?select=id&limit=1"
--    esperado: 200
SELECT current_setting('pgrst.db_schemas', true) AS pgrst_db_schemas_si_esta_seteado;
