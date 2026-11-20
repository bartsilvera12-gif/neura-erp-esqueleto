-- Cambios de estructura aplicados por el Agente IA (ticket #621, neura-erp-esqueleto). Ya están en la base.

-- Separar timbrados de remisión de exportación de los generales para no mezclar numeración.
alter table esqueletoerp.notas_remision_config add column if not exists tipo text not null default 'general';
