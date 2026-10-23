-- =============================================================================
-- Producción de muebles · Fase 6c: inspección final, cierre y reapertura
-- =============================================================================
-- Según la especificación (sección 5.10, algoritmo 8.4, flujo 9.3):
--   - prod_cierres: inspección final (responsable, observaciones, retrabajos,
--     evidencia), snapshot de costos/utilidad/margen al cierre y, si se cerró
--     con pendientes, el motivo de la excepción aprobada. Quién/cuándo cerró.
--   - prod_proyecto_reaperturas: auditoría de reaperturas (quién solicita, quién
--     autoriza, motivo y qué datos se modifican). No se borran rastros.
-- El proyecto cerrado queda en solo lectura (estado 'cerrado'); una reapertura
-- lo devuelve a 'entregado' y queda auditada.
-- Solo esqueletoerp (Living Room). Idempotente.
-- =============================================================================

SET lock_timeout = '5s';

BEGIN;

CREATE TABLE IF NOT EXISTS esqueletoerp.prod_cierres (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL,
  proyecto_id         uuid NOT NULL REFERENCES esqueletoerp.prod_proyectos(id) ON DELETE CASCADE,
  inspeccion_responsable text,
  inspeccion_observaciones text,
  retrabajos          text,
  evidencia_path      text,
  excepcion_motivo    text,                              -- si se cerró con pendientes
  snapshot            jsonb,                             -- costos/utilidad/margen al cierre
  cerrado_por         text,
  cerrado_at          timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prod_cierres_proyecto_idx ON esqueletoerp.prod_cierres (empresa_id, proyecto_id);

CREATE TABLE IF NOT EXISTS esqueletoerp.prod_proyecto_reaperturas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL,
  proyecto_id         uuid NOT NULL REFERENCES esqueletoerp.prod_proyectos(id) ON DELETE CASCADE,
  solicitado_por      text,
  autorizado_por      text,
  motivo              text NOT NULL,
  datos_modificados   text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMIT;

NOTIFY pgrst, 'reload schema';
