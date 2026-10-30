-- El campo "Emisor" es opcional en el formulario de notas de remisión
-- (/notas-remision/nueva lo muestra como "Emisor (opcional)"), y la API inserta
-- NULL cuando se deja vacío. Pero la columna estaba como NOT NULL, así que el
-- alta fallaba con:
--   null value in column "emisor" of relation "notas_remision" violates not-null constraint
-- Se permite NULL para que la remisión pueda guardarse sin emisor.
BEGIN;

ALTER TABLE esqueletoerp.notas_remision ALTER COLUMN emisor DROP NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
