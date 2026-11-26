-- Cambios de estructura aplicados por el Agente IA (ticket #716, neura-erp-esqueleto). Ya están en la base.

-- Historial de adelantos y pagos parciales a contratistas por cotización aprobada
create table if not exists esqueletoerp.prod_contratista_pagos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  proyecto_id uuid not null,
  orden_id uuid not null,
  contratista_id uuid,
  monto numeric not null check (monto > 0),
  fecha date not null default current_date,
  metodo_pago text not null default 'efectivo',
  observaciones text,
  comprobante_path text,
  created_by uuid,
  created_by_nombre text,
  created_at timestamptz not null default now()
);
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on "esqueletoerp".prod_contratista_pagos to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on "esqueletoerp".prod_contratista_pagos to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on "esqueletoerp".prod_contratista_pagos to service_role;
