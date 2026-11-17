-- Cambios de estructura aplicados por el Agente IA (ticket #442, neura-erp-esqueleto). Ya están en la base.

-- Vincular presupuestos con prospectos del CRM
ALTER TABLE esqueletoerp.presupuestos ADD COLUMN IF NOT EXISTS prospecto_id uuid NULL;
