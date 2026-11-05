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
