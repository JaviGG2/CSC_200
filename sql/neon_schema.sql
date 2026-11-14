-- ============================================================================
-- Esquema Neon / PostgreSQL - Comuna Socialista Carabobo 200
-- Idempotente: puede ejecutarse varias veces sin perder datos.
-- Contiene TODAS las tablas que usa la aplicación (viviendas, jefes,
-- integrantes, registros del censo, usuarios, territorios y configuración).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Consejos comunales
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consejos_comunales (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(160) NOT NULL UNIQUE,
  sector VARCHAR(160),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consejos_comunales_activo
  ON consejos_comunales (activo, nombre);

-- ---------------------------------------------------------------------------
-- Viviendas / planillas (con soporte de consejo comunal y anexos)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viviendas (
  id BIGSERIAL PRIMARY KEY,
  origen VARCHAR(40) NOT NULL DEFAULT 'local',
  origen_id BIGINT,
  estado VARCHAR(80) NOT NULL DEFAULT 'FALCÓN',
  municipio VARCHAR(80) NOT NULL DEFAULT 'MIRANDA',
  parroquia VARCHAR(120) NOT NULL DEFAULT 'SAN ANTONIO',
  comunidad VARCHAR(160) NOT NULL,
  etapa VARCHAR(80),
  manzana VARCHAR(80),
  direccion TEXT NOT NULL,
  numero_casa VARCHAR(40),
  consejo_comunal_id BIGINT REFERENCES consejos_comunales(id) ON DELETE SET NULL,
  es_anexo BOOLEAN NOT NULL DEFAULT false,
  numero_anexo VARCHAR(50),
  vivienda_principal_id BIGINT REFERENCES viviendas(id) ON DELETE SET NULL,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Actualiza despliegues donde la tabla ya existía.
ALTER TABLE viviendas
  ADD COLUMN IF NOT EXISTS origen VARCHAR(40) NOT NULL DEFAULT 'local';
ALTER TABLE viviendas ADD COLUMN IF NOT EXISTS origen_id BIGINT;
ALTER TABLE viviendas ADD COLUMN IF NOT EXISTS consejo_comunal_id BIGINT;
ALTER TABLE viviendas ADD COLUMN IF NOT EXISTS es_anexo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE viviendas ADD COLUMN IF NOT EXISTS numero_anexo VARCHAR(50);
ALTER TABLE viviendas ADD COLUMN IF NOT EXISTS vivienda_principal_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'viviendas_consejo_comunal_id_fkey'
  ) THEN
    ALTER TABLE viviendas
      ADD CONSTRAINT viviendas_consejo_comunal_id_fkey
      FOREIGN KEY (consejo_comunal_id)
      REFERENCES consejos_comunales(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'viviendas_principal_id_fkey'
  ) THEN
    ALTER TABLE viviendas
      ADD CONSTRAINT viviendas_principal_id_fkey
      FOREIGN KEY (vivienda_principal_id)
      REFERENCES viviendas(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_viviendas_origen
  ON viviendas (origen, origen_id);
CREATE INDEX IF NOT EXISTS idx_viviendas_consejo
  ON viviendas (consejo_comunal_id);
CREATE INDEX IF NOT EXISTS idx_viviendas_principal
  ON viviendas (vivienda_principal_id);
CREATE INDEX IF NOT EXISTS idx_viviendas_anexo
  ON viviendas (es_anexo);
CREATE INDEX IF NOT EXISTS idx_viviendas_comunidad
  ON viviendas (comunidad);

-- ---------------------------------------------------------------------------
-- Jefes de familia
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jefes_familia (
  id BIGSERIAL PRIMARY KEY,
  vivienda_id BIGINT NOT NULL UNIQUE
    REFERENCES viviendas(id) ON DELETE CASCADE,
  cedula_tipo VARCHAR(1) NOT NULL DEFAULT 'V',
  cedula_numero VARCHAR(20),
  nombres VARCHAR(160) NOT NULL,
  apellidos VARCHAR(160) NOT NULL,
  fecha_nacimiento DATE NOT NULL,
  edad INTEGER,
  sexo VARCHAR(1) NOT NULL,
  telefono_movil VARCHAR(30),
  telefono_habitacion VARCHAR(30),
  telefono_trabajo VARCHAR(30),
  correo VARCHAR(160),
  nivel_instruccion VARCHAR(120),
  estado_civil VARCHAR(80),
  profesion VARCHAR(160),
  trabaja_actual BOOLEAN NOT NULL DEFAULT false,
  clasificacion_ingresos VARCHAR(120),
  frecuencia_ingresos VARCHAR(80),
  ingreso_mensual_bs NUMERIC(12, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE jefes_familia ADD COLUMN IF NOT EXISTS ingreso_mensual_bs NUMERIC(12, 2);
ALTER TABLE jefes_familia ADD COLUMN IF NOT EXISTS frecuencia_ingresos VARCHAR(80);

CREATE INDEX IF NOT EXISTS idx_jefes_familia_cedula
  ON jefes_familia (cedula_tipo, cedula_numero);

-- ---------------------------------------------------------------------------
-- Integrantes del grupo familiar (Sección III)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integrantes_grupo_familiar (
  id BIGSERIAL PRIMARY KEY,
  vivienda_id BIGINT NOT NULL
    REFERENCES viviendas(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  apellidos VARCHAR(160) NOT NULL,
  nombres VARCHAR(160) NOT NULL,
  cedula_tipo VARCHAR(1),
  cedula_numero VARCHAR(20),
  fecha_nacimiento DATE,
  edad INTEGER,
  sexo VARCHAR(1),
  parentesco VARCHAR(120) NOT NULL,
  nivel_instruccion VARCHAR(120),
  profesion VARCHAR(160),
  ingreso_mensual NUMERIC(12, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vivienda_id, numero)
);

ALTER TABLE integrantes_grupo_familiar
  ADD COLUMN IF NOT EXISTS ingreso_mensual NUMERIC(12, 2);

CREATE INDEX IF NOT EXISTS idx_integrantes_grupo_vivienda
  ON integrantes_grupo_familiar (vivienda_id);

-- ---------------------------------------------------------------------------
-- Resumen denormalizado usado por la sincronización histórica
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registros_censo (
  id BIGSERIAL PRIMARY KEY,
  cedula TEXT NOT NULL UNIQUE,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  fecha_nacimiento TIMESTAMPTZ NOT NULL,
  datos_extras JSONB NOT NULL DEFAULT '{}'::jsonb,
  sector TEXT,
  origen TEXT NOT NULL DEFAULT 'comuna_carabobo200',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE registros_censo
  ADD COLUMN IF NOT EXISTS sector TEXT;

CREATE INDEX IF NOT EXISTS idx_registros_censo_fecha
  ON registros_censo (fecha_nacimiento DESC);

CREATE INDEX IF NOT EXISTS idx_registros_censo_sector
  ON registros_censo (sector);

-- ---------------------------------------------------------------------------
-- Usuarios del sistema (autenticación)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id BIGSERIAL PRIMARY KEY,
  usuario VARCHAR(80) NOT NULL UNIQUE,
  nombre VARCHAR(160) NOT NULL,
  clave_hash TEXT NOT NULL,
  rol VARCHAR(20) NOT NULL DEFAULT 'gestor'
    CHECK (rol IN ('admin', 'gestor')),
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_rol
  ON usuarios (rol, activo);

-- ---------------------------------------------------------------------------
-- Estructura territorial (estado / municipio / parroquia / comunidad / ...)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS territorios (
  id BIGSERIAL PRIMARY KEY,
  tipo VARCHAR(20) NOT NULL
    CHECK (tipo IN ('estado', 'municipio', 'parroquia', 'comunidad', 'etapa', 'manzana')),
  nombre VARCHAR(160) NOT NULL,
  padre_id BIGINT REFERENCES territorios(id) ON DELETE CASCADE,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_territorios_tipo
  ON territorios (tipo, padre_id, orden);

-- ---------------------------------------------------------------------------
-- Visibilidad y obligatoriedad de los campos del censo
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config_campos_censo (
  clave VARCHAR(120) PRIMARY KEY,
  etiqueta VARCHAR(200) NOT NULL,
  seccion VARCHAR(120) NOT NULL,
  visible BOOLEAN NOT NULL DEFAULT true,
  requerido BOOLEAN NOT NULL DEFAULT false,
  orden INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Campos dinámicos del formulario de registros del censo
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campos_formulario (
  id BIGSERIAL PRIMARY KEY,
  clave VARCHAR(120) NOT NULL UNIQUE,
  etiqueta VARCHAR(200) NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'text'
    CHECK (tipo IN ('text', 'number', 'date', 'tel', 'email', 'textarea', 'select')),
  opciones JSONB,
  requerido BOOLEAN NOT NULL DEFAULT false,
  ayuda TEXT,
  orden INTEGER NOT NULL DEFAULT 100,
  activo BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_campos_formulario_activo
  ON campos_formulario (activo, orden);

-- ---------------------------------------------------------------------------
-- Opciones de los campos configurables del formulario (listas desplegables)
-- Ej.: parentesco, nivel_instruccion, estado_civil, clasificacion_ingresos...
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opciones_campos (
  id BIGSERIAL PRIMARY KEY,
  campo VARCHAR(120) NOT NULL,
  valor VARCHAR(160) NOT NULL,
  etiqueta VARCHAR(160),
  orden INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campo, valor)
);

CREATE INDEX IF NOT EXISTS idx_opciones_campos_campo
  ON opciones_campos (campo, activo, orden);

-- Catálogo inicial de opciones (idempotente).
INSERT INTO opciones_campos (campo, valor, etiqueta, orden) VALUES
  ('sexo', 'M', 'Masculino', 10),
  ('sexo', 'F', 'Femenino', 20),
  ('nivel_instruccion', 'Primaria', 'Primaria', 10),
  ('nivel_instruccion', 'Bachillerato', 'Bachillerato', 20),
  ('nivel_instruccion', 'Técnico', 'Técnico', 30),
  ('nivel_instruccion', 'Universitario', 'Universitario', 40),
  ('nivel_instruccion', 'Posgrado', 'Posgrado', 50),
  ('nivel_instruccion', 'Ninguno', 'Ninguno', 60),
  ('estado_civil', 'Soltero/a', 'Soltero/a', 10),
  ('estado_civil', 'Casado/a', 'Casado/a', 20),
  ('estado_civil', 'Divorciado/a', 'Divorciado/a', 30),
  ('estado_civil', 'Viudo/a', 'Viudo/a', 40),
  ('estado_civil', 'Concubino/a', 'Concubino/a', 50),
  ('parentesco', 'Cónyuge', 'Cónyuge', 10),
  ('parentesco', 'Hijo/a', 'Hijo/a', 20),
  ('parentesco', 'Padre/Madre', 'Padre/Madre', 30),
  ('parentesco', 'Hermano/a', 'Hermano/a', 40),
  ('parentesco', 'Nieto/a', 'Nieto/a', 50),
  ('parentesco', 'Otro', 'Otro', 60),
  ('clasificacion_ingresos', 'Diario', 'Diario', 10),
  ('clasificacion_ingresos', 'Semanal', 'Semanal', 20),
  ('clasificacion_ingresos', 'Quincenal', 'Quincenal', 30),
  ('clasificacion_ingresos', 'Mensual', 'Mensual', 40),
  ('clasificacion_ingresos', 'Por Trabajo Independiente/Informal', 'Por Trabajo Independiente/Informal', 50),
  ('frecuencia_ingresos', 'Diario', 'Diario', 10),
  ('frecuencia_ingresos', 'Semanal', 'Semanal', 20),
  ('frecuencia_ingresos', 'Quincenal', 'Quincenal', 30),
  ('frecuencia_ingresos', 'Mensual', 'Mensual', 40),
  ('frecuencia_ingresos', 'Variable', 'Variable', 50),
  ('trabaja_actual', 'Sí', 'Sí', 10),
  ('trabaja_actual', 'No', 'No', 20)
ON CONFLICT (campo, valor) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Cola de eliminaciones pendientes de propagar a Neon
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS neon_eliminaciones (
  id BIGSERIAL PRIMARY KEY,
  cedula TEXT NOT NULL UNIQUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
