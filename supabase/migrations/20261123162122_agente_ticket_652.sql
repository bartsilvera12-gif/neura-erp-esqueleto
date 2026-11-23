-- Cambios de estructura aplicados por el Agente IA (ticket #652, neura-erp-esqueleto). Ya están en la base.

-- Marcar timbrados históricos (regularización G-2025) que no se usan en la emisión normal
alter table esqueletoerp.facturas_exportacion_config add column if not exists historico boolean not null default false;

-- Marcar timbrados históricos de remisión (regularización G-2025)
alter table esqueletoerp.notas_remision_config add column if not exists historico boolean not null default false;
