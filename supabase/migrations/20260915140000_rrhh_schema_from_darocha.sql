-- =============================================================================
-- RRHH · Schema completo portado desde darocha
-- =============================================================================
-- Crea (por tenant) las tablas del modulo Recursos Humanos:
--   sucursales, cargos_catalogo, departamentos_catalogo, cursos_catalogo,
--   especialidades, feriados, fichar_tokens, rrhh_politica_vacaciones,
--   empleados, empleado_archivos, empleado_ausencias, empleado_cursos,
--   empleado_especialidades, empleado_fichajes, empleado_salarios,
--   empleado_vacaciones, nomina_recibos, nomina_recibo_devengos,
--   nomina_recibo_deducciones.
--
-- Reglas: IF NOT EXISTS + aditivo + idempotente. Reproduce columnas, FKs a
-- {schema}.empresas, checks e indices de darocha.
-- =============================================================================

DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'empresas' AND c.relkind = 'r'
      AND n.nspname = 'esqueletoerp'  -- base compartida: solo este esquema
  LOOP
    RAISE NOTICE '[rrhh_schema] schema=%', r.sch;

    -- =========================================================================
    -- Tabla base: sucursales
    -- =========================================================================
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.sucursales (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id        uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        codigo            text NOT NULL,
        nombre            text NOT NULL,
        es_principal      boolean NOT NULL DEFAULT false,
        activa            boolean NOT NULL DEFAULT true,
        establecimiento   text,
        punto_expedicion  text,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS sucursales_codigo_uq ON %I.sucursales(empresa_id, codigo)', r.sch);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS sucursales_una_principal_uq ON %I.sucursales(empresa_id) WHERE es_principal', r.sch);

    -- =========================================================================
    -- Catalogos
    -- =========================================================================
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.cargos_catalogo (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id  uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        slug        text NOT NULL,
        nombre      text NOT NULL,
        activo      boolean NOT NULL DEFAULT true,
        orden       integer NOT NULL DEFAULT 999,
        es_sistema  boolean NOT NULL DEFAULT false,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        UNIQUE (empresa_id, slug)
      )
    $f$, r.sch, r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_cargos_catalogo_empresa ON %I.cargos_catalogo(empresa_id, activo, orden)', r.sch);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.departamentos_catalogo (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id  uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        slug        text NOT NULL CHECK (length(btrim(slug)) > 0),
        nombre      text NOT NULL CHECK (length(btrim(nombre)) > 0),
        activo      boolean NOT NULL DEFAULT true,
        orden       smallint NOT NULL DEFAULT 0,
        es_sistema  boolean NOT NULL DEFAULT false,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        UNIQUE (empresa_id, slug)
      )
    $f$, r.sch, r.sch);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.cursos_catalogo (
        id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id               uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        nombre                   text NOT NULL CHECK (length(btrim(nombre)) > 0),
        slug                     text NOT NULL CHECK (length(btrim(slug)) > 0),
        tipo                     text NOT NULL DEFAULT 'curso'
                                  CHECK (tipo IN ('curso','certificado','habilitacion','documento_legal')),
        entidad_emisora_default  text,
        duracion_dias            integer,
        activo                   boolean NOT NULL DEFAULT true,
        orden                    integer NOT NULL DEFAULT 0,
        created_by               uuid,
        created_at               timestamptz NOT NULL DEFAULT now(),
        updated_at               timestamptz NOT NULL DEFAULT now(),
        UNIQUE (empresa_id, slug)
      )
    $f$, r.sch, r.sch);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.especialidades (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id  uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        nombre      text NOT NULL CHECK (length(btrim(nombre)) > 0),
        slug        text NOT NULL CHECK (length(btrim(slug)) > 0),
        activo      boolean NOT NULL DEFAULT true,
        orden       integer NOT NULL DEFAULT 0,
        created_by  uuid,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        UNIQUE (empresa_id, slug)
      )
    $f$, r.sch, r.sch);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.feriados (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id  uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        fecha       date NOT NULL,
        nombre      text NOT NULL,
        ambito      text NOT NULL DEFAULT 'nacional'
                    CHECK (ambito IN ('nacional','regional','local')),
        created_at  timestamptz NOT NULL DEFAULT now(),
        created_by  uuid,
        UNIQUE (empresa_id, fecha)
      )
    $f$, r.sch, r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS feriados_empresa_fecha_idx ON %I.feriados(empresa_id, fecha)', r.sch);

    -- =========================================================================
    -- Politica de vacaciones (PK = empresa_id, una fila por tenant)
    -- =========================================================================
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.rrhh_politica_vacaciones (
        empresa_id               uuid PRIMARY KEY REFERENCES %I.empresas(id) ON DELETE CASCADE,
        dias_anuales             integer NOT NULL DEFAULT 12,
        dias_anuales_5_10        integer NOT NULL DEFAULT 18,
        dias_anuales_mas10       integer NOT NULL DEFAULT 30,
        tipo_computo             text NOT NULL DEFAULT 'laborables'
                                  CHECK (tipo_computo IN ('naturales','laborables')),
        proporcional_ingreso     boolean NOT NULL DEFAULT true,
        requiere_aprobacion      boolean NOT NULL DEFAULT true,
        permitir_saldo_negativo  boolean NOT NULL DEFAULT false,
        arrastra_pendientes      boolean NOT NULL DEFAULT false,
        arrastra_dias_max        integer,
        pais_region              text NOT NULL DEFAULT 'PY',
        updated_at               timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch);

    -- =========================================================================
    -- Empleados
    -- =========================================================================
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.empleados (
        id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id                     uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        nombre                         text NOT NULL CHECK (length(btrim(nombre)) > 0),
        tipo_documento                 text DEFAULT 'CI',
        documento                      text,
        activo                         boolean NOT NULL DEFAULT true,
        estado                         text DEFAULT 'activo'
                                        CHECK (estado IS NULL OR estado IN ('activo','baja','suspendido','pendiente')),
        fecha_ingreso                  date,
        fecha_baja                     date,
        fecha_nacimiento               date,
        lugar_nacimiento               text,
        nacionalidad                   text DEFAULT 'Paraguaya',
        estado_civil                   text,
        grupo_sanguineo                text,
        direccion                      text,
        email                          text,
        telefono                       text,
        contacto_emergencia_nombre     text,
        contacto_emergencia_telefono   text,
        contacto_emergencia_parentesco text,
        cargo                          text,
        tipo_empleado                  text,
        tipo_periodo                   text DEFAULT 'mensual',
        tipos_empleado                 text[] DEFAULT '{}'::text[],
        tipo_contrato                  text,
        jornada_laboral                text,
        departamento                   text,
        seccion                        text,
        supervisor                     text,
        sucursal_id                    uuid REFERENCES %I.sucursales(id),
        chofer_habilitacion            text,
        chofer_fecha_venc              date,
        chofer_km                      numeric,
        chofer_observacion             text,
        participa_comisiones           boolean NOT NULL DEFAULT false,
        comision_politica_id           text,
        comision_observacion           text,
        salario_base                   numeric NOT NULL DEFAULT 0,
        salario_complementario         numeric NOT NULL DEFAULT 0,
        costo_hora                     numeric NOT NULL DEFAULT 0,
        moneda                         text NOT NULL DEFAULT 'PYG' CHECK (moneda IN ('PYG','USD')),
        banco                          text,
        numero_cuenta                  text,
        cobrar_con_cheque              boolean NOT NULL DEFAULT false,
        excluir_liquidaciones          boolean NOT NULL DEFAULT false,
        observaciones                  text,
        created_by                     uuid,
        created_at                     timestamptz NOT NULL DEFAULT now(),
        updated_at                     timestamptz NOT NULL DEFAULT now(),
        afiliacion_ips                 text,
        categoria_ips                  text,
        tiene_bonif_familiar           boolean NOT NULL DEFAULT false
      )
    $f$, r.sch, r.sch, r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS empleados_empresa_idx ON %I.empleados(empresa_id)', r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS empleados_activo_idx ON %I.empleados(empresa_id, activo)', r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS empleados_documento_idx ON %I.empleados(empresa_id, documento) WHERE documento IS NOT NULL', r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS empleados_sucursal_idx ON %I.empleados(sucursal_id)', r.sch);

    -- =========================================================================
    -- fichar_tokens (dispositivo kiosco)
    -- =========================================================================
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.fichar_tokens (
        token        text PRIMARY KEY,
        empresa_id   uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        sucursal_id  uuid REFERENCES %I.sucursales(id) ON DELETE SET NULL,
        activo       boolean NOT NULL DEFAULT true,
        created_at   timestamptz NOT NULL DEFAULT now(),
        created_by   uuid,
        descripcion  text
      )
    $f$, r.sch, r.sch, r.sch);

    -- =========================================================================
    -- Detalles del empleado
    -- =========================================================================
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.empleado_archivos (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id      uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        empleado_id     uuid NOT NULL REFERENCES %I.empleados(id) ON DELETE CASCADE,
        nombre          text NOT NULL,
        storage_bucket  text NOT NULL DEFAULT 'empleado-archivos',
        storage_path    text NOT NULL,
        mime_type       text,
        size_bytes      bigint,
        uploaded_by     uuid,
        created_at      timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch, r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS empleado_archivos_empleado_idx ON %I.empleado_archivos(empleado_id)', r.sch);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.empleado_ausencias (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id   uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        empleado_id  uuid NOT NULL REFERENCES %I.empleados(id) ON DELETE CASCADE,
        fecha_desde  date NOT NULL,
        fecha_hasta  date NOT NULL,
        tipo         text NOT NULL CHECK (tipo IN ('reposo','vacaciones','permiso','baja','otro')),
        observacion  text,
        created_at   timestamptz NOT NULL DEFAULT now(),
        created_by   uuid
      )
    $f$, r.sch, r.sch, r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS empleado_ausencias_empleado_idx ON %I.empleado_ausencias(empleado_id, fecha_desde)', r.sch);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.empleado_cursos (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id         uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        empleado_id        uuid NOT NULL REFERENCES %I.empleados(id) ON DELETE CASCADE,
        curso_id           uuid REFERENCES %I.cursos_catalogo(id) ON DELETE SET NULL,
        nombre             text NOT NULL,
        tipo               text NOT NULL DEFAULT 'curso'
                            CHECK (tipo IN ('curso','certificado','habilitacion','documento_legal')),
        entidad_emisora    text,
        fecha_emision      date,
        fecha_vencimiento  date,
        estado             text NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN ('vigente','vencido','por_vencer','pendiente','en_revision')),
        storage_bucket     text,
        storage_path       text,
        mime_type          text,
        size_bytes         bigint,
        observaciones      text,
        created_by         uuid,
        created_at         timestamptz NOT NULL DEFAULT now(),
        updated_at         timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch, r.sch, r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS empleado_cursos_empleado_idx ON %I.empleado_cursos(empleado_id)', r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS empleado_cursos_estado_idx ON %I.empleado_cursos(empresa_id, estado)', r.sch);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.empleado_especialidades (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id       uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        empleado_id      uuid NOT NULL REFERENCES %I.empleados(id) ON DELETE CASCADE,
        especialidad_id  uuid NOT NULL REFERENCES %I.especialidades(id) ON DELETE RESTRICT,
        es_principal     boolean NOT NULL DEFAULT false,
        nivel            text CHECK (nivel IS NULL OR nivel IN ('aprendiz','intermedio','especialista','encargado')),
        observaciones    text,
        created_by       uuid,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now(),
        UNIQUE (empresa_id, empleado_id, especialidad_id)
      )
    $f$, r.sch, r.sch, r.sch, r.sch);
    EXECUTE format($f$
      CREATE UNIQUE INDEX IF NOT EXISTS empleado_especialidades_principal_uniq
        ON %I.empleado_especialidades(empresa_id, empleado_id) WHERE es_principal = true
    $f$, r.sch);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.empleado_fichajes (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id          uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        empleado_id         uuid NOT NULL REFERENCES %I.empleados(id) ON DELETE CASCADE,
        fecha               date NOT NULL,
        hora_entrada        text,
        hora_salida         text,
        horas               numeric,
        observacion         text,
        entrada_lat         numeric,
        entrada_lng         numeric,
        entrada_marcado_at  timestamptz,
        salida_lat          numeric,
        salida_lng          numeric,
        salida_marcado_at   timestamptz,
        marcado_kiosco      boolean NOT NULL DEFAULT false,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch, r.sch);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS empleado_fichajes_empleado_fecha_uq ON %I.empleado_fichajes(empleado_id, fecha)', r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS empleado_fichajes_empresa_fecha_idx ON %I.empleado_fichajes(empresa_id, fecha DESC)', r.sch);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.empleado_salarios (
        id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id            uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        empleado_id           uuid NOT NULL REFERENCES %I.empleados(id) ON DELETE CASCADE,
        fecha_vigencia_desde  date NOT NULL,
        fecha_vigencia_hasta  date,
        salario_bruto         numeric NOT NULL DEFAULT 0,
        salario_neto          numeric,
        plus_peligrosidad     numeric NOT NULL DEFAULT 0,
        plus_prl              numeric NOT NULL DEFAULT 0,
        otros_pluses          jsonb   NOT NULL DEFAULT '{}'::jsonb,
        deducciones           jsonb   NOT NULL DEFAULT '{}'::jsonb,
        coste_empresa         numeric,
        moneda                text NOT NULL DEFAULT 'PYG' CHECK (moneda IN ('PYG','USD')),
        observaciones         text,
        created_by            uuid,
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch, r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS empleado_salarios_empleado_idx ON %I.empleado_salarios(empleado_id, fecha_vigencia_desde DESC)', r.sch);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.empleado_vacaciones (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id     uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        empleado_id    uuid NOT NULL REFERENCES %I.empleados(id) ON DELETE CASCADE,
        fecha_desde    date NOT NULL,
        fecha_hasta    date NOT NULL,
        dias           integer NOT NULL,
        tipo_ausencia  text NOT NULL DEFAULT 'vacaciones'
                        CHECK (tipo_ausencia IN ('vacaciones','permiso_retribuido','baja_medica','ausencia_sin_sueldo','otro')),
        estado         text NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente','aprobada','cancelada','rechazada')),
        origen         text NOT NULL DEFAULT 'empleado'
                        CHECK (origen IN ('empresa','empleado')),
        observacion    text,
        aprobado_at    timestamptz,
        aprobado_by    uuid,
        cancelado_at   timestamptz,
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch, r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS empleado_vacaciones_empleado_idx ON %I.empleado_vacaciones(empleado_id, fecha_desde DESC)', r.sch);

    -- =========================================================================
    -- Nomina
    -- =========================================================================
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.nomina_recibos (
        id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id                        uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        empleado_id                       uuid NOT NULL REFERENCES %I.empleados(id) ON DELETE CASCADE,
        periodo_desde                     date NOT NULL,
        periodo_hasta                     date NOT NULL,
        total_dias                        integer NOT NULL DEFAULT 30,
        dias_trabajados                   integer NOT NULL DEFAULT 30,
        empresa_nombre_snapshot           text,
        empresa_ruc_snapshot              text,
        empresa_ips_patronal_snapshot     text,
        empleado_nombre_snapshot          text,
        empleado_documento_snapshot       text,
        empleado_afiliacion_ips_snapshot  text,
        empleado_categoria_ips_snapshot   text,
        empleado_cargo_snapshot           text,
        empleado_antiguedad_snapshot      date,
        total_devengado                   numeric NOT NULL DEFAULT 0,
        total_deducciones                 numeric NOT NULL DEFAULT 0,
        liquido                           numeric NOT NULL DEFAULT 0,
        aporte_patronal                   numeric NOT NULL DEFAULT 0,
        coste_empresa                     numeric NOT NULL DEFAULT 0,
        moneda                            text NOT NULL DEFAULT 'PYG' CHECK (moneda IN ('PYG','USD')),
        estado                            text NOT NULL DEFAULT 'borrador'
                                            CHECK (estado IN ('borrador','emitido','anulado')),
        observaciones                     text,
        created_at                        timestamptz NOT NULL DEFAULT now(),
        updated_at                        timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch, r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS nomina_recibos_empleado_idx ON %I.nomina_recibos(empleado_id, periodo_desde DESC)', r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS nomina_recibos_empresa_periodo_idx ON %I.nomina_recibos(empresa_id, periodo_desde DESC)', r.sch);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.nomina_recibo_devengos (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        recibo_id         uuid NOT NULL REFERENCES %I.nomina_recibos(id) ON DELETE CASCADE,
        empresa_id        uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        concepto          text NOT NULL,
        cantidad          numeric,
        importe_unitario  numeric,
        importe_total     numeric NOT NULL DEFAULT 0,
        es_salarial       boolean NOT NULL DEFAULT true,
        orden             integer NOT NULL DEFAULT 0,
        created_at        timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch, r.sch);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.nomina_recibo_deducciones (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        recibo_id   uuid NOT NULL REFERENCES %I.nomina_recibos(id) ON DELETE CASCADE,
        empresa_id  uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        tipo        text NOT NULL CHECK (tipo IN ('ips_trabajador','ips_patronal','prestamo','judicial','otro')),
        concepto    text NOT NULL,
        base        numeric,
        tipo_pct    numeric,
        importe     numeric NOT NULL DEFAULT 0,
        orden       integer NOT NULL DEFAULT 0,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch, r.sch, r.sch);

    RAISE NOTICE '[rrhh_schema] schema=% listo', r.sch;
  END LOOP;
END
$mig$;
