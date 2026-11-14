-- ============================================================================
-- Migración: consejos comunales, anexos y guardado estructurado
-- Ejecutar en Neon (PostgreSQL) una sola vez. Es idempotente.
-- ============================================================================

BEGIN;

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

CREATE INDEX IF NOT EXISTS idx_jefes_familia_cedula
  ON jefes_familia (cedula_tipo, cedula_numero);

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

COMMIT;
