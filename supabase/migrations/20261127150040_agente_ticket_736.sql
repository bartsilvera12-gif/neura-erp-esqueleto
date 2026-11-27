-- Cambios de estructura aplicados por el Agente IA (ticket #736, neura-erp-esqueleto). Ya están en la base.

-- Registrar quién editó una nota de remisión, cuándo y qué cambió.
create table if not exists esqueletoerp.notas_remision_auditoria (id uuid primary key default gen_random_uuid(), empresa_id uuid not null, nota_remision_id uuid not null, numero text, usuario_id text, usuario_nombre text, cambios jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on "esqueletoerp".notas_remision_auditoria to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on "esqueletoerp".notas_remision_auditoria to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on "esqueletoerp".notas_remision_auditoria to service_role;
