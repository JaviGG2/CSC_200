import dotenv from 'dotenv';
import path from 'path';
import Database from 'better-sqlite3';
import { hashClave } from './auth';

dotenv.config({ quiet: true });

export const rutaBaseDatos = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(process.cwd(), 'comuna_carabobo200.db');

export const db: InstanceType<typeof Database> = new Database(rutaBaseDatos);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

export type Vivienda = {
  id: number;
  estado: string;
  municipio: string;
  parroquia: string;
  comunidad: string;
  etapa: string | null;
  manzana: string | null;
  direccion: string;
  numero_casa: string | null;
  consejo_comunal_id: number | null;
  es_anexo: boolean;
  numero_anexo: string | null;
  vivienda_principal_id: number | null;
  fecha_registro: string;
  sincronizado: boolean;
  sincronizado_en: string | null;
  sincronizar_neon: boolean;
};

export type ConsejoComunal = {
  id: number;
  nombre: string;
  sector: string | null;
  activo: boolean;
};

export type CedulaTipo = 'V' | 'E' | 'S';

export type JefeFamilia = {
  id: number;
  vivienda_id: number;
  cedula_tipo: CedulaTipo;
  cedula_numero: string | null;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  edad: number | null;
  sexo: 'M' | 'F';
  telefono_movil: string | null;
  telefono_habitacion: string | null;
  telefono_trabajo: string | null;
  correo: string | null;
  nivel_instruccion: string;
  estado_civil: string;
  profesion: string | null;
  trabaja_actual: 'Sí' | 'No';
  clasificacion_ingresos: string;
  frecuencia_ingresos: string | null;
  ingreso_mensual_bs: number | null;
};

export type IntegranteFamiliar = {
  id: number;
  vivienda_id: number;
  numero: number;
  apellidos: string;
  nombres: string;
  cedula_tipo: CedulaTipo | null;
  cedula_numero: string | null;
  fecha_nacimiento: string | null;
  edad: number | null;
  sexo: 'M' | 'F' | null;
  parentesco: string;
  nivel_instruccion: string | null;
  profesion: string | null;
  ingreso_mensual: number | null;
};

export type CampoFormulario = {
  id: number;
  clave: string;
  etiqueta: string;
  tipo: string;
  opciones: string[];
  requerido: boolean;
  ayuda: string | null;
  orden: number;
  activo: boolean;
};

export type RegistroCenso = {
  id: number;
  cedula: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  datos_extras: Record<string, unknown>;
  sincronizado: boolean;
  sincronizado_en: string | null;
  valores: Record<string, string>;
  extras: Array<{ clave: string; etiqueta: string; valor: string }>;
};

export type Usuario = {
  id: number;
  usuario: string;
  nombre: string;
  rol: 'admin' | 'gestor';
  activo: boolean;
  creado_en: string;
};

export type TipoTerritorio =
  | 'estado'
  | 'municipio'
  | 'parroquia'
  | 'comunidad'
  | 'etapa'
  | 'manzana';

export type Territorio = {
  id: number;
  tipo: TipoTerritorio;
  nombre: string;
  padre_id: number | null;
  padre_nombre: string | null;
  activo: boolean;
  orden: number;
};

export type ConfigCampo = {
  clave: string;
  etiqueta: string;
  seccion: string;
  visible: boolean;
  requerido: boolean;
  orden: number;
};

export type PersonaIndividual = {
  tipo: 'jefe' | 'integrante';
  persona_id: number;
  vivienda_id: number;
  cedula: string | null;
  cedula_tipo: string | null;
  cedula_numero: string | null;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string | null;
  edad: number | null;
  sexo: 'M' | 'F' | null;
  parentesco: string;
  nivel_instruccion: string | null;
  profesion: string | null;
  trabaja_actual: string | null;
  estado_civil: string | null;
  telefono_movil: string | null;
  telefono_habitacion: string | null;
  telefono_trabajo: string | null;
  correo: string | null;
  estado: string;
  municipio: string;
  parroquia: string;
  comunidad: string;
  etapa: string | null;
  manzana: string | null;
  direccion: string;
  numero_casa: string | null;
  sincronizado: number;
  sincronizar_neon: number;
};

db.exec(`
  CREATE TABLE IF NOT EXISTS registros_censo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cedula TEXT NOT NULL UNIQUE,
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    fecha_nacimiento TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    datos_extras TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(datos_extras)),
    sincronizado INTEGER NOT NULL DEFAULT 0 CHECK (sincronizado IN (0, 1)),
    sincronizado_en TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_registros_pendientes
    ON registros_censo (sincronizado, id);

  CREATE TABLE IF NOT EXISTS campos_formulario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clave TEXT NOT NULL UNIQUE,
    etiqueta TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'text'
      CHECK (tipo IN ('text', 'number', 'date', 'tel', 'email', 'textarea', 'select')),
    opciones TEXT CHECK (opciones IS NULL OR json_valid(opciones)),
    requerido INTEGER NOT NULL DEFAULT 0 CHECK (requerido IN (0, 1)),
    ayuda TEXT,
    orden INTEGER NOT NULL DEFAULT 100,
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS opciones_campos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campo TEXT NOT NULL,
    valor TEXT NOT NULL,
    etiqueta TEXT,
    orden INTEGER NOT NULL DEFAULT 0,
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    UNIQUE (campo, valor)
  );

  CREATE INDEX IF NOT EXISTS idx_opciones_campos_campo
    ON opciones_campos (campo, activo, orden);

  CREATE TABLE IF NOT EXISTS consejos_comunales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    sector TEXT,
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_consejos_nombre
    ON consejos_comunales (nombre COLLATE NOCASE);

  CREATE TABLE IF NOT EXISTS viviendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estado TEXT NOT NULL DEFAULT 'FALCÓN',
    municipio TEXT NOT NULL DEFAULT 'MIRANDA',
    parroquia TEXT NOT NULL DEFAULT 'SAN ANTONIO',
    comunidad TEXT NOT NULL,
    etapa TEXT,
    manzana TEXT,
    direccion TEXT NOT NULL,
    numero_casa TEXT,
    consejo_comunal_id INTEGER REFERENCES consejos_comunales(id) ON DELETE SET NULL,
    es_anexo INTEGER NOT NULL DEFAULT 0 CHECK (es_anexo IN (0, 1)),
    numero_anexo TEXT,
    vivienda_principal_id INTEGER REFERENCES viviendas(id) ON DELETE SET NULL,
    fecha_registro TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    sincronizado INTEGER NOT NULL DEFAULT 0 CHECK (sincronizado IN (0, 1)),
    sincronizado_en TEXT,
    sincronizar_neon INTEGER NOT NULL DEFAULT 1 CHECK (sincronizar_neon IN (0, 1))
  );

  CREATE INDEX IF NOT EXISTS idx_viviendas_manzana ON viviendas(manzana);
  CREATE INDEX IF NOT EXISTS idx_viviendas_etapa ON viviendas(etapa);
  CREATE INDEX IF NOT EXISTS idx_viviendas_comunidad ON viviendas(comunidad);
  CREATE INDEX IF NOT EXISTS idx_viviendas_fecha ON viviendas(fecha_registro DESC);

  CREATE TABLE IF NOT EXISTS jefes_familia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vivienda_id INTEGER NOT NULL REFERENCES viviendas(id) ON DELETE CASCADE,
    cedula_tipo TEXT NOT NULL CHECK (cedula_tipo IN ('V', 'E', 'S')),
    cedula_numero TEXT,
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    fecha_nacimiento TEXT NOT NULL,
    edad INTEGER,
    sexo TEXT NOT NULL CHECK (sexo IN ('M', 'F')),
    telefono_movil TEXT,
    telefono_habitacion TEXT,
    telefono_trabajo TEXT,
    correo TEXT,
    nivel_instruccion TEXT NOT NULL,
    estado_civil TEXT NOT NULL,
    profesion TEXT,
    trabaja_actual TEXT NOT NULL CHECK (trabaja_actual IN ('Sí', 'No')),
    clasificacion_ingresos TEXT NOT NULL,
    frecuencia_ingresos TEXT,
    ingreso_mensual_bs REAL,
    UNIQUE(cedula_tipo, cedula_numero)
  );

  CREATE INDEX IF NOT EXISTS idx_jefes_cedula ON jefes_familia(cedula_tipo, cedula_numero);
  CREATE INDEX IF NOT EXISTS idx_jefes_vivienda ON jefes_familia(vivienda_id);

  CREATE TABLE IF NOT EXISTS integrantes_grupo_familiar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vivienda_id INTEGER NOT NULL REFERENCES viviendas(id) ON DELETE CASCADE,
    numero INTEGER NOT NULL,
    apellidos TEXT NOT NULL,
    nombres TEXT NOT NULL,
    cedula_tipo TEXT CHECK (cedula_tipo IN ('V', 'E', 'S')),
    cedula_numero TEXT,
    fecha_nacimiento TEXT,
    edad INTEGER,
    sexo TEXT CHECK (sexo IN ('M', 'F')),
    parentesco TEXT NOT NULL,
    nivel_instruccion TEXT,
    profesion TEXT,
    ingreso_mensual REAL
  );

  CREATE INDEX IF NOT EXISTS idx_integrantes_vivienda ON integrantes_grupo_familiar(vivienda_id);
  CREATE INDEX IF NOT EXISTS idx_integrantes_cedula ON integrantes_grupo_familiar(cedula_tipo, cedula_numero);

  CREATE TABLE IF NOT EXISTS neon_eliminaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cedula TEXT NOT NULL UNIQUE,
    creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

function asegurarColumnaSincronizarNeon() {
  const columnas = db.prepare('PRAGMA table_info(viviendas)').all() as Array<{ name: string }>;
  const nombres = columnas.map((columna) => columna.name);

  if (!nombres.includes('sincronizar_neon')) {
    db.exec(`
      ALTER TABLE viviendas ADD COLUMN sincronizar_neon INTEGER NOT NULL DEFAULT 1 CHECK (sincronizar_neon IN (0, 1))
    `);
  }
}

asegurarColumnaSincronizarNeon();

// Agrega a bases ya existentes las columnas de consejo comunal, anexos e
// ingresos que usan el escaneo inteligente y el formulario de vivienda.
function asegurarColumnasNuevas() {
  const columnasDe = (tabla: string) =>
    (db.prepare(`PRAGMA table_info(${tabla})`).all() as Array<{ name: string }>).map(
      (columna) => columna.name
    );

  const viviendas = columnasDe('viviendas');
  if (!viviendas.includes('consejo_comunal_id')) {
    db.exec(
      'ALTER TABLE viviendas ADD COLUMN consejo_comunal_id INTEGER REFERENCES consejos_comunales(id) ON DELETE SET NULL'
    );
  }
  if (!viviendas.includes('es_anexo')) {
    db.exec(
      'ALTER TABLE viviendas ADD COLUMN es_anexo INTEGER NOT NULL DEFAULT 0 CHECK (es_anexo IN (0, 1))'
    );
  }
  if (!viviendas.includes('numero_anexo')) {
    db.exec('ALTER TABLE viviendas ADD COLUMN numero_anexo TEXT');
  }
  if (!viviendas.includes('vivienda_principal_id')) {
    db.exec(
      'ALTER TABLE viviendas ADD COLUMN vivienda_principal_id INTEGER REFERENCES viviendas(id) ON DELETE SET NULL'
    );
  }

  if (!columnasDe('jefes_familia').includes('ingreso_mensual_bs')) {
    db.exec('ALTER TABLE jefes_familia ADD COLUMN ingreso_mensual_bs REAL');
  }
  if (!columnasDe('integrantes_grupo_familiar').includes('ingreso_mensual')) {
    db.exec('ALTER TABLE integrantes_grupo_familiar ADD COLUMN ingreso_mensual REAL');
  }
}

asegurarColumnasNuevas();

// Habilita el tipo de cédula 'S' ("Sin cédula") en bases ya creadas. SQLite no
// permite modificar un CHECK, así que hay que reconstruir las dos tablas.
function tablaAdmiteSinCedula(nombre: string): boolean {
  const fila = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(nombre) as { sql: string } | undefined;
  return !fila || /'S'/.test(fila.sql);
}

function asegurarTipoSinCedula() {
  const faltaJefes = !tablaAdmiteSinCedula('jefes_familia');
  const faltaIntegrantes = !tablaAdmiteSinCedula('integrantes_grupo_familiar');
  if (!faltaJefes && !faltaIntegrantes) return;

  // La vista se recrea más abajo al cargar el módulo, pero impide reconstruir
  // las tablas si sigue existiendo.
  db.exec('DROP VIEW IF EXISTS vista_personas_individuales');

  db.pragma('foreign_keys = OFF');
  const migrar = db.transaction(() => {
    if (faltaJefes) {
      db.exec(`
        CREATE TABLE jefes_familia_nueva (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vivienda_id INTEGER NOT NULL REFERENCES viviendas(id) ON DELETE CASCADE,
          cedula_tipo TEXT NOT NULL CHECK (cedula_tipo IN ('V', 'E', 'S')),
          cedula_numero TEXT,
          nombres TEXT NOT NULL,
          apellidos TEXT NOT NULL,
          fecha_nacimiento TEXT NOT NULL,
          edad INTEGER,
          sexo TEXT NOT NULL CHECK (sexo IN ('M', 'F')),
          telefono_movil TEXT,
          telefono_habitacion TEXT,
          telefono_trabajo TEXT,
          correo TEXT,
          nivel_instruccion TEXT NOT NULL,
          estado_civil TEXT NOT NULL,
          profesion TEXT,
          trabaja_actual TEXT NOT NULL CHECK (trabaja_actual IN ('Sí', 'No')),
          clasificacion_ingresos TEXT NOT NULL,
          frecuencia_ingresos TEXT,
          ingreso_mensual_bs REAL,
          UNIQUE(cedula_tipo, cedula_numero)
        );

        INSERT INTO jefes_familia_nueva
          (id, vivienda_id, cedula_tipo, cedula_numero, nombres, apellidos, fecha_nacimiento,
           edad, sexo, telefono_movil, telefono_habitacion, telefono_trabajo, correo,
           nivel_instruccion, estado_civil, profesion, trabaja_actual, clasificacion_ingresos,
           frecuencia_ingresos, ingreso_mensual_bs)
        SELECT
          id, vivienda_id, cedula_tipo, cedula_numero, nombres, apellidos, fecha_nacimiento,
          edad, sexo, telefono_movil, telefono_habitacion, telefono_trabajo, correo,
          nivel_instruccion, estado_civil, profesion, trabaja_actual, clasificacion_ingresos,
          frecuencia_ingresos, ingreso_mensual_bs
        FROM jefes_familia;

        DROP TABLE jefes_familia;
        ALTER TABLE jefes_familia_nueva RENAME TO jefes_familia;

        CREATE INDEX IF NOT EXISTS idx_jefes_cedula ON jefes_familia(cedula_tipo, cedula_numero);
        CREATE INDEX IF NOT EXISTS idx_jefes_vivienda ON jefes_familia(vivienda_id);
      `);
    }

    if (faltaIntegrantes) {
      db.exec(`
        CREATE TABLE integrantes_grupo_familiar_nueva (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vivienda_id INTEGER NOT NULL REFERENCES viviendas(id) ON DELETE CASCADE,
          numero INTEGER NOT NULL,
          apellidos TEXT NOT NULL,
          nombres TEXT NOT NULL,
          cedula_tipo TEXT CHECK (cedula_tipo IN ('V', 'E', 'S')),
          cedula_numero TEXT,
          fecha_nacimiento TEXT,
          edad INTEGER,
          sexo TEXT CHECK (sexo IN ('M', 'F')),
          parentesco TEXT NOT NULL,
          nivel_instruccion TEXT,
          profesion TEXT,
          ingreso_mensual REAL
        );

        INSERT INTO integrantes_grupo_familiar_nueva
          (id, vivienda_id, numero, apellidos, nombres, cedula_tipo, cedula_numero,
           fecha_nacimiento, edad, sexo, parentesco, nivel_instruccion, profesion, ingreso_mensual)
        SELECT
          id, vivienda_id, numero, apellidos, nombres, cedula_tipo, cedula_numero,
          fecha_nacimiento, edad, sexo, parentesco, nivel_instruccion, profesion, ingreso_mensual
        FROM integrantes_grupo_familiar;

        DROP TABLE integrantes_grupo_familiar;
        ALTER TABLE integrantes_grupo_familiar_nueva RENAME TO integrantes_grupo_familiar;

        CREATE INDEX IF NOT EXISTS idx_integrantes_vivienda ON integrantes_grupo_familiar(vivienda_id);
        CREATE INDEX IF NOT EXISTS idx_integrantes_cedula ON integrantes_grupo_familiar(cedula_tipo, cedula_numero);
      `);
    }
  });

  try {
    migrar();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

asegurarTipoSinCedula();

// ============================================================================
// ESQUEMA: USUARIOS, TERRITORIOS, CONFIGURACIÓN DE CAMPOS Y VISTA UNIFICADA
// ============================================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    clave_hash TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'gestor' CHECK (rol IN ('admin', 'gestor')),
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS territorios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('estado', 'municipio', 'parroquia', 'comunidad', 'etapa', 'manzana')),
    nombre TEXT NOT NULL,
    padre_id INTEGER REFERENCES territorios(id) ON DELETE CASCADE,
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    orden INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_territorios_tipo ON territorios(tipo, padre_id, orden);

  CREATE TABLE IF NOT EXISTS config_campos_censo (
    clave TEXT PRIMARY KEY,
    etiqueta TEXT NOT NULL,
    seccion TEXT NOT NULL,
    visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
    requerido INTEGER NOT NULL DEFAULT 0 CHECK (requerido IN (0, 1)),
    orden INTEGER NOT NULL DEFAULT 0
  );
`);

const CONFIG_CAMPOS_INICIALES: Array<{
  clave: string;
  etiqueta: string;
  seccion: string;
  requerido: number;
  orden: number;
}> = [
  { clave: 'w-estado', etiqueta: 'Estado', seccion: 'Ubicación', requerido: 1, orden: 10 },
  { clave: 'w-municipio', etiqueta: 'Municipio', seccion: 'Ubicación', requerido: 1, orden: 20 },
  { clave: 'w-parroquia', etiqueta: 'Parroquia', seccion: 'Ubicación', requerido: 1, orden: 30 },
  { clave: 'w-comunidad', etiqueta: 'Comunidad', seccion: 'Ubicación', requerido: 1, orden: 40 },
  { clave: 'w-etapa', etiqueta: 'Etapa', seccion: 'Ubicación', requerido: 0, orden: 50 },
  { clave: 'w-manzana', etiqueta: 'Manzana', seccion: 'Ubicación', requerido: 0, orden: 60 },
  { clave: 'w-direccion', etiqueta: 'Dirección', seccion: 'Ubicación', requerido: 1, orden: 70 },
  { clave: 'w-numero-casa', etiqueta: 'Número de casa', seccion: 'Ubicación', requerido: 0, orden: 80 },
  { clave: 'w-j-cedula-tipo', etiqueta: 'Tipo de cédula', seccion: 'Jefe de familia', requerido: 1, orden: 90 },
  { clave: 'w-j-cedula-numero', etiqueta: 'Número de cédula', seccion: 'Jefe de familia', requerido: 1, orden: 100 },
  { clave: 'w-j-nombres', etiqueta: 'Nombres', seccion: 'Jefe de familia', requerido: 1, orden: 110 },
  { clave: 'w-j-apellidos', etiqueta: 'Apellidos', seccion: 'Jefe de familia', requerido: 1, orden: 120 },
  { clave: 'w-j-fecha-nacimiento', etiqueta: 'Fecha de nacimiento', seccion: 'Jefe de familia', requerido: 1, orden: 130 },
  { clave: 'w-j-sexo', etiqueta: 'Sexo', seccion: 'Jefe de familia', requerido: 1, orden: 140 },
  { clave: 'w-j-tel-movil', etiqueta: 'Teléfono móvil', seccion: 'Jefe de familia', requerido: 0, orden: 150 },
  { clave: 'w-j-tel-hab', etiqueta: 'Teléfono habitación', seccion: 'Jefe de familia', requerido: 0, orden: 160 },
  { clave: 'w-j-tel-trabajo', etiqueta: 'Teléfono trabajo', seccion: 'Jefe de familia', requerido: 0, orden: 170 },
  { clave: 'w-j-correo', etiqueta: 'Correo electrónico', seccion: 'Jefe de familia', requerido: 0, orden: 180 },
  { clave: 'w-j-nivel-instruccion', etiqueta: 'Nivel de instrucción', seccion: 'Jefe de familia', requerido: 1, orden: 190 },
  { clave: 'w-j-estado-civil', etiqueta: 'Estado civil', seccion: 'Jefe de familia', requerido: 1, orden: 200 },
  { clave: 'w-j-profesion', etiqueta: 'Profesión u oficio', seccion: 'Jefe de familia', requerido: 0, orden: 210 },
  { clave: 'w-j-trabaja-actual', etiqueta: '¿Trabaja actualmente?', seccion: 'Jefe de familia', requerido: 1, orden: 220 },
  { clave: 'w-j-clasificacion-ingresos', etiqueta: 'Clasificación de ingresos', seccion: 'Jefe de familia', requerido: 1, orden: 230 },
  { clave: 'w-j-frecuencia-ingresos', etiqueta: 'Frecuencia de ingresos', seccion: 'Jefe de familia', requerido: 0, orden: 240 },
];

const insertarConfigCampo = db.prepare(`
  INSERT OR IGNORE INTO config_campos_censo (clave, etiqueta, seccion, requerido, orden)
  VALUES (@clave, @etiqueta, @seccion, @requerido, @orden)
`);

db.transaction((campos: typeof CONFIG_CAMPOS_INICIALES) => {
  for (const campo of campos) insertarConfigCampo.run(campo);
})(CONFIG_CAMPOS_INICIALES);

// Opciones iniciales de las listas desplegables. Neon es la fuente central;
// estas filas permiten que el formulario funcione también sin conexión.
const OPCIONES_CAMPOS_INICIALES: Array<{
  campo: string;
  valor: string;
  etiqueta: string;
  orden: number;
}> = [
  { campo: 'sexo', valor: 'M', etiqueta: 'Masculino', orden: 10 },
  { campo: 'sexo', valor: 'F', etiqueta: 'Femenino', orden: 20 },
  { campo: 'nivel_instruccion', valor: 'Primaria', etiqueta: 'Primaria', orden: 10 },
  { campo: 'nivel_instruccion', valor: 'Bachillerato', etiqueta: 'Bachillerato', orden: 20 },
  { campo: 'nivel_instruccion', valor: 'Técnico', etiqueta: 'Técnico', orden: 30 },
  { campo: 'nivel_instruccion', valor: 'Universitario', etiqueta: 'Universitario', orden: 40 },
  { campo: 'nivel_instruccion', valor: 'Posgrado', etiqueta: 'Posgrado', orden: 50 },
  { campo: 'nivel_instruccion', valor: 'Ninguno', etiqueta: 'Ninguno', orden: 60 },
  { campo: 'estado_civil', valor: 'Soltero/a', etiqueta: 'Soltero/a', orden: 10 },
  { campo: 'estado_civil', valor: 'Casado/a', etiqueta: 'Casado/a', orden: 20 },
  { campo: 'estado_civil', valor: 'Divorciado/a', etiqueta: 'Divorciado/a', orden: 30 },
  { campo: 'estado_civil', valor: 'Viudo/a', etiqueta: 'Viudo/a', orden: 40 },
  { campo: 'estado_civil', valor: 'Concubino/a', etiqueta: 'Concubino/a', orden: 50 },
  { campo: 'parentesco', valor: 'Cónyuge', etiqueta: 'Cónyuge', orden: 10 },
  { campo: 'parentesco', valor: 'Hijo/a', etiqueta: 'Hijo/a', orden: 20 },
  { campo: 'parentesco', valor: 'Padre/Madre', etiqueta: 'Padre/Madre', orden: 30 },
  { campo: 'parentesco', valor: 'Hermano/a', etiqueta: 'Hermano/a', orden: 40 },
  { campo: 'parentesco', valor: 'Nieto/a', etiqueta: 'Nieto/a', orden: 50 },
  { campo: 'parentesco', valor: 'Otro', etiqueta: 'Otro', orden: 60 },
  { campo: 'clasificacion_ingresos', valor: 'Diario', etiqueta: 'Diario', orden: 10 },
  { campo: 'clasificacion_ingresos', valor: 'Semanal', etiqueta: 'Semanal', orden: 20 },
  { campo: 'clasificacion_ingresos', valor: 'Quincenal', etiqueta: 'Quincenal', orden: 30 },
  { campo: 'clasificacion_ingresos', valor: 'Mensual', etiqueta: 'Mensual', orden: 40 },
  { campo: 'clasificacion_ingresos', valor: 'Por Trabajo Independiente/Informal', etiqueta: 'Por Trabajo Independiente/Informal', orden: 50 },
  { campo: 'frecuencia_ingresos', valor: 'Diario', etiqueta: 'Diario', orden: 10 },
  { campo: 'frecuencia_ingresos', valor: 'Semanal', etiqueta: 'Semanal', orden: 20 },
  { campo: 'frecuencia_ingresos', valor: 'Quincenal', etiqueta: 'Quincenal', orden: 30 },
  { campo: 'frecuencia_ingresos', valor: 'Mensual', etiqueta: 'Mensual', orden: 40 },
  { campo: 'frecuencia_ingresos', valor: 'Variable', etiqueta: 'Variable', orden: 50 },
  { campo: 'trabaja_actual', valor: 'Sí', etiqueta: 'Sí', orden: 10 },
  { campo: 'trabaja_actual', valor: 'No', etiqueta: 'No', orden: 20 },
];

const insertarOpcionCampo = db.prepare(`
  INSERT OR IGNORE INTO opciones_campos (campo, valor, etiqueta, orden)
  VALUES (@campo, @valor, @etiqueta, @orden)
`);

db.transaction((opciones: typeof OPCIONES_CAMPOS_INICIALES) => {
  for (const opcion of opciones) insertarOpcionCampo.run(opcion);
})(OPCIONES_CAMPOS_INICIALES);

function sembrarTerritoriosIniciales() {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM territorios').get() as {
    total: number;
  };
  if (total > 0) return;

  const insertar = db.prepare(
    'INSERT INTO territorios (tipo, nombre, padre_id, orden) VALUES (?, ?, ?, ?)'
  );

  db.transaction(() => {
    const estado = Number(insertar.run('estado', 'FALCÓN', null, 10).lastInsertRowid);
    const municipio = Number(insertar.run('municipio', 'MIRANDA', estado, 10).lastInsertRowid);
    const parroquia = Number(
      insertar.run('parroquia', 'SAN ANTONIO', municipio, 10).lastInsertRowid
    );

    const comunidad = Number(
      insertar.run('comunidad', 'Carabobo 200', parroquia, 10).lastInsertRowid
    );
    insertar.run('comunidad', 'calvanis', parroquia, 20);

    const etapa1 = Number(insertar.run('etapa', 'Etapa 1', comunidad, 10).lastInsertRowid);
    insertar.run('etapa', 'Etapa 2', comunidad, 20);
    insertar.run('etapa', 'Etapa 3', comunidad, 30);

    insertar.run('manzana', 'Manzana 1', etapa1, 10);
    insertar.run('manzana', 'Manzana 2', etapa1, 20);
    insertar.run('manzana', 'Manzana 3', etapa1, 30);
    insertar.run('manzana', 'Manzana 4', etapa1, 40);
    insertar.run('manzana', '1', etapa1, 50);
  })();
}

sembrarTerritoriosIniciales();

function sembrarConsejosComunales() {
  db.prepare(`
    INSERT OR IGNORE INTO consejos_comunales (nombre)
    SELECT DISTINCT nombre FROM territorios
    WHERE tipo = 'comunidad' AND TRIM(nombre) <> ''
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO consejos_comunales (nombre)
    SELECT DISTINCT comunidad FROM viviendas
    WHERE comunidad IS NOT NULL AND TRIM(comunidad) <> ''
  `).run();
}

sembrarConsejosComunales();

function sembrarAdminInicial() {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get() as {
    total: number;
  };
  if (total > 0) return;

  const usuario = (process.env.ADMIN_USUARIO || 'admin').trim();
  const clave = process.env.ADMIN_CLAVE || process.env.CLAVE_ADMIN || 'csc200';

  db.prepare(`
    INSERT INTO usuarios (usuario, nombre, clave_hash, rol)
    VALUES (?, ?, ?, 'admin')
  `).run(usuario, 'Administrador', hashClave(clave));
}

sembrarAdminInicial();

db.exec(`
  DROP VIEW IF EXISTS vista_personas_individuales;

  CREATE VIEW vista_personas_individuales AS
    SELECT
      'jefe' AS tipo,
      j.id AS persona_id,
      j.vivienda_id AS vivienda_id,
      CASE
        WHEN j.cedula_tipo IN ('V', 'E') AND j.cedula_numero IS NOT NULL AND j.cedula_numero <> ''
          THEN j.cedula_tipo || '-' || j.cedula_numero
        ELSE NULL
      END AS cedula,
      j.cedula_tipo AS cedula_tipo,
      j.cedula_numero AS cedula_numero,
      j.nombres AS nombres,
      j.apellidos AS apellidos,
      j.fecha_nacimiento AS fecha_nacimiento,
      j.edad AS edad,
      j.sexo AS sexo,
      'Jefe de Familia' AS parentesco,
      j.nivel_instruccion AS nivel_instruccion,
      j.profesion AS profesion,
      j.trabaja_actual AS trabaja_actual,
      j.estado_civil AS estado_civil,
      j.telefono_movil AS telefono_movil,
      j.telefono_habitacion AS telefono_habitacion,
      j.telefono_trabajo AS telefono_trabajo,
      j.correo AS correo,
      v.estado AS estado,
      v.municipio AS municipio,
      v.parroquia AS parroquia,
      v.comunidad AS comunidad,
      v.etapa AS etapa,
      v.manzana AS manzana,
      v.direccion AS direccion,
      v.numero_casa AS numero_casa,
      v.sincronizado AS sincronizado,
      v.sincronizar_neon AS sincronizar_neon
    FROM jefes_familia j
    JOIN viviendas v ON v.id = j.vivienda_id
    UNION ALL
    SELECT
      'integrante' AS tipo,
      i.id AS persona_id,
      i.vivienda_id AS vivienda_id,
      CASE
        WHEN i.cedula_tipo IS NOT NULL AND i.cedula_numero IS NOT NULL AND i.cedula_numero <> ''
          THEN i.cedula_tipo || '-' || i.cedula_numero
        ELSE NULL
      END AS cedula,
      i.cedula_tipo AS cedula_tipo,
      i.cedula_numero AS cedula_numero,
      i.nombres AS nombres,
      i.apellidos AS apellidos,
      i.fecha_nacimiento AS fecha_nacimiento,
      i.edad AS edad,
      i.sexo AS sexo,
      i.parentesco AS parentesco,
      i.nivel_instruccion AS nivel_instruccion,
      i.profesion AS profesion,
      NULL AS trabaja_actual,
      NULL AS estado_civil,
      NULL AS telefono_movil,
      NULL AS telefono_habitacion,
      NULL AS telefono_trabajo,
      NULL AS correo,
      v.estado AS estado,
      v.municipio AS municipio,
      v.parroquia AS parroquia,
      v.comunidad AS comunidad,
      v.etapa AS etapa,
      v.manzana AS manzana,
      v.direccion AS direccion,
      v.numero_casa AS numero_casa,
      v.sincronizado AS sincronizado,
      v.sincronizar_neon AS sincronizar_neon
    FROM integrantes_grupo_familiar i
    JOIN viviendas v ON v.id = i.vivienda_id;
`);

const CAMPOS_INICIALES = [
  {
    clave: 'edad',
    etiqueta: 'Edad',
    tipo: 'number',
    opciones: null as string[] | null,
    requerido: 0,
    ayuda: 'Años cumplidos',
    orden: 10,
  },
  {
    clave: 'sexo',
    etiqueta: 'Sexo',
    tipo: 'select',
    opciones: ['Femenino', 'Masculino', 'Otro'],
    requerido: 0,
    ayuda: null,
    orden: 20,
  },
  {
    clave: 'telefono',
    etiqueta: 'Teléfono de contacto',
    tipo: 'tel',
    opciones: null,
    requerido: 0,
    ayuda: 'Número local o celular',
    orden: 30,
  },
  {
    clave: 'calle',
    etiqueta: 'Calle o vereda',
    tipo: 'text',
    opciones: null,
    requerido: 0,
    ayuda: null,
    orden: 50,
  },
  {
    clave: 'numero_casa',
    etiqueta: 'Número de vivienda',
    tipo: 'text',
    opciones: null,
    requerido: 0,
    ayuda: null,
    orden: 60,
  },
  {
    clave: 'consejo_comunal',
    etiqueta: 'Consejo Comunal',
    tipo: 'text',
    opciones: null,
    requerido: 0,
    ayuda: 'Estructura jerárquica a la que pertenece',
    orden: 70,
  },
  {
    clave: 'jefe_familia',
    etiqueta: '¿Es jefe o jefa de familia?',
    tipo: 'select',
    opciones: ['Sí', 'No'],
    requerido: 0,
    ayuda: null,
    orden: 80,
  },
  {
    clave: 'personas_hogar',
    etiqueta: 'Personas en el hogar',
    tipo: 'number',
    opciones: null,
    requerido: 0,
    ayuda: 'Cantidad de integrantes del núcleo familiar',
    orden: 90,
  },
  {
    clave: 'condicion_medica',
    etiqueta: 'Condiciones médicas',
    tipo: 'textarea',
    opciones: null,
    requerido: 0,
    ayuda: 'Enfermedades, discapacidades, medicamentos o tratamientos',
    orden: 100,
  },
  {
    clave: 'recibe_clap',
    etiqueta: '¿Recibe CLAP?',
    tipo: 'select',
    opciones: ['Sí', 'No'],
    requerido: 0,
    ayuda: null,
    orden: 110,
  },
  {
    clave: 'observaciones',
    etiqueta: 'Observaciones',
    tipo: 'textarea',
    opciones: null,
    requerido: 0,
    ayuda: 'Cualquier detalle adicional del censo',
    orden: 120,
  },
];

export const CLAVES_RESERVADAS = [
  'id',
  'cedula',
  'nombres',
  'apellidos',
  'fecha_nacimiento',
  'datos_extras',
  'sincronizado',
  'sincronizado_en',
];

export const TIPOS_CAMPO = ['text', 'number', 'date', 'tel', 'email', 'textarea', 'select'];

const insertarCampoInicial = db.prepare(`
  INSERT OR IGNORE INTO campos_formulario
    (clave, etiqueta, tipo, opciones, requerido, ayuda, orden)
  VALUES
    (@clave, @etiqueta, @tipo, @opciones, @requerido, @ayuda, @orden)
`);

const sembrarCampos = db.transaction((campos: typeof CAMPOS_INICIALES) => {
  for (const campo of campos) {
    insertarCampoInicial.run({
      ...campo,
      opciones: campo.opciones ? JSON.stringify(campo.opciones) : null,
    });
  }
});

sembrarCampos(CAMPOS_INICIALES);

function deserializarOpciones(valor: string | null): string[] {
  if (!valor) return [];
  try {
    const opciones = JSON.parse(valor);
    return Array.isArray(opciones) ? opciones : [];
  } catch {
    return [];
  }
}

function humanizar(clave: string): string {
  const texto = String(clave).replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatearValor(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

export function obtenerCampos({ soloActivos = true } = {}): CampoFormulario[] {
  const filtro = soloActivos ? 'WHERE activo = 1' : '';
  const filas = db
    .prepare(`SELECT * FROM campos_formulario ${filtro} ORDER BY orden, id`)
    .all() as Array<{ id: number; clave: string; etiqueta: string; tipo: string; opciones: string | null; requerido: number; ayuda: string | null; orden: number; activo: number }>;

  return filas.map((fila) => ({
    ...fila,
    opciones: deserializarOpciones(fila.opciones),
    requerido: Boolean(fila.requerido),
    activo: Boolean(fila.activo),
  }));
}

export function obtenerCamposFormulario(): CampoFormulario[] {
  return obtenerCampos().filter((campo) => !CLAVES_RESERVADAS.includes(campo.clave));
}

function construirEtiquetas(): Map<string, string> {
  return new Map(
    obtenerCampos({ soloActivos: false }).map((campo) => [campo.clave, campo.etiqueta])
  );
}

function calcularEdad(fechaNacimiento: string): number {
  const hoy = new Date();
  const nacimiento = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mesDiff = hoy.getMonth() - nacimiento.getMonth();
  if (mesDiff < 0 || (mesDiff === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad -= 1;
  }
  return edad;
}

function formatearRegistro(fila: any, etiquetas: Map<string, string>): RegistroCenso {
  let extras: Record<string, unknown> = {};
  try {
    const parseado = JSON.parse(fila.datos_extras);
    if (parseado && typeof parseado === 'object' && !Array.isArray(parseado)) {
      extras = parseado;
    }
  } catch {
    extras = {};
  }

  const valores: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(extras)) {
    valores[clave] = formatearValor(valor);
  }

  return {
    ...fila,
    sincronizado: Boolean(fila.sincronizado),
    valores,
    extras: Object.entries(extras).map(([clave, valor]) => ({
      clave,
      etiqueta: etiquetas.get(clave) || humanizar(clave),
      valor: formatearValor(valor),
    })),
  };
}

const registroPorId = db.prepare(`
  SELECT * FROM registros_censo
  WHERE id = ?
`);

export function obtenerRegistros(): RegistroCenso[] {
  const filas = db
    .prepare(`
      SELECT * FROM registros_censo
      ORDER BY id DESC
    `)
    .all();

  const etiquetas = construirEtiquetas();
  return filas.map((fila) => formatearRegistro(fila, etiquetas));
}

export function obtenerRegistroPorId(id: number): RegistroCenso | null {
  const fila = registroPorId.get(id) as any;
  return fila ? formatearRegistro(fila, construirEtiquetas()) : null;
}

export function obtenerEstadisticas() {
  const registros = db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN sincronizado = 0 THEN 1 ELSE 0 END), 0) AS pendientes,
        COALESCE(SUM(CASE WHEN sincronizado = 1 THEN 1 ELSE 0 END), 0) AS sincronizados
      FROM registros_censo
    `)
    .get() as { total: number; pendientes: number; sincronizados: number };

  const campos = db
    .prepare('SELECT COUNT(*) AS total FROM campos_formulario WHERE activo = 1')
    .get() as { total: number };

  return {
    ...registros,
    campos: campos.total,
  };
}

function insertarRegistro({ cedula, nombres, apellidos, fechaRegistro, extras }: {
  cedula: string;
  nombres: string;
  apellidos: string;
  fechaRegistro: string | null;
  extras: Record<string, unknown>;
}) {
  const resultado = db
    .prepare(`
      INSERT INTO registros_censo
        (cedula, nombres, apellidos, fecha_nacimiento, datos_extras)
      VALUES
        (?, ?, ?, COALESCE(?, datetime('now', 'localtime')), ?)
    `)
    .run(cedula, nombres, apellidos, fechaRegistro || null, JSON.stringify(extras));

  return resultado.lastInsertRowid as number;
}

function actualizarRegistro({
  id,
  cedula,
  nombres,
  apellidos,
  fechaRegistro,
  extras,
}: {
  id: number;
  cedula: string;
  nombres: string;
  apellidos: string;
  fechaRegistro: string | null;
  extras: Record<string, unknown>;
}) {
  const resultado = db
    .prepare(`
      UPDATE registros_censo
      SET cedula = ?,
          nombres = ?,
          apellidos = ?,
          fecha_nacimiento = COALESCE(?, fecha_nacimiento),
          datos_extras = ?,
          sincronizado = 0,
          sincronizado_en = NULL
      WHERE id = ?
    `)
    .run(
      cedula,
      nombres,
      apellidos,
      fechaRegistro || null,
      JSON.stringify(extras),
      id
    );

  return resultado.changes > 0;
}

function generarClaveCampo(etiqueta: string): string {
  const base = String(etiqueta)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);

  return base || 'campo';
}

const existeClaveCampo = db.prepare('SELECT 1 FROM campos_formulario WHERE clave = ?');
const obtenerUltimoOrden = db.prepare(
  'SELECT COALESCE(MAX(orden), 0) AS maximo FROM campos_formulario'
);
const insertarDefinicionCampo = db.prepare(`
  INSERT INTO campos_formulario
    (clave, etiqueta, tipo, opciones, requerido, ayuda, orden)
  VALUES
    (@clave, @etiqueta, @tipo, @opciones, @requerido, NULL, @orden)
`);

export function crearCampo({ etiqueta, tipo, opciones = [], requerido }: {
  etiqueta: string;
  tipo: string;
  opciones?: string[];
  requerido: boolean;
}): string {
  const base = generarClaveCampo(etiqueta);
  let clave = base;
  let sufijo = 2;

  while (CLAVES_RESERVADAS.includes(clave) || existeClaveCampo.get(clave)) {
    clave = `${base}_${sufijo}`;
    sufijo += 1;
  }

  const { maximo } = obtenerUltimoOrden.get() as { maximo: number };

  insertarDefinicionCampo.run({
    clave,
    etiqueta,
    tipo,
    opciones: opciones.length ? JSON.stringify(opciones) : null,
    requerido: requerido ? 1 : 0,
    orden: Number(maximo) + 10,
  });

  return clave;
}

const campoPorId = db.prepare('SELECT * FROM campos_formulario WHERE id = ?');

const actualizarDefinicionCampo = db.prepare(`
  UPDATE campos_formulario
  SET etiqueta = @etiqueta,
      tipo = @tipo,
      opciones = @opciones,
      requerido = @requerido
  WHERE id = @id
`);

const alternarEstadoCampo = db.prepare(`
  UPDATE campos_formulario
  SET activo = CASE activo WHEN 1 THEN 0 ELSE 1 END
  WHERE id = ?
`);

const eliminarDefinicionCampo = db.prepare('DELETE FROM campos_formulario WHERE id = ?');

export function obtenerCampoPorId(id: number): CampoFormulario | null {
  const fila = campoPorId.get(id) as any;
  if (!fila) return null;

  return {
    ...fila,
    opciones: deserializarOpciones(fila.opciones),
    requerido: Boolean(fila.requerido),
    activo: Boolean(fila.activo),
  };
}

export function actualizarCampo({ id, etiqueta, tipo, opciones = [], requerido }: {
  id: number;
  etiqueta: string;
  tipo: string;
  opciones?: string[];
  requerido: boolean;
}) {
  const resultado = actualizarDefinicionCampo.run({
    id,
    etiqueta,
    tipo,
    opciones: opciones.length ? JSON.stringify(opciones) : null,
    requerido: requerido ? 1 : 0,
  });

  return resultado.changes > 0;
}

export function cambiarEstadoCampo(id: number): boolean | null {
  const campo = obtenerCampoPorId(id);
  if (!campo) return null;

  alternarEstadoCampo.run(id);
  return !campo.activo;
}

export function eliminarCampo(id: number): boolean {
  return eliminarDefinicionCampo.run(id).changes > 0;
}

const contarRegistros = db.prepare('SELECT COUNT(*) AS total FROM registros_censo');
const borrarRegistro = db.prepare('DELETE FROM registros_censo WHERE id = ?');
const borrarTodosLosRegistros = db.prepare('DELETE FROM registros_censo');
const moverIdRegistro = db.prepare('UPDATE registros_censo SET id = ? WHERE id = ?');
const listarIdsRegistros = db.prepare('SELECT id FROM registros_censo ORDER BY id');
const maximoIdRegistro = db.prepare(
  'SELECT COALESCE(MAX(id), 0) AS maximo FROM registros_censo'
);
const actualizarSecuenciaRegistros = db.prepare(
  "UPDATE sqlite_sequence SET seq = ? WHERE name = 'registros_censo'"
);
const insertarSecuenciaRegistros = db.prepare(
  "INSERT INTO sqlite_sequence (name, seq) VALUES ('registros_censo', ?)"
);

function reiniciarSecuenciaRegistros() {
  const { total } = contarRegistros.get() as { total: number };

  if (actualizarSecuenciaRegistros.run(total).changes === 0) {
    insertarSecuenciaRegistros.run(total);
  }
}

export function renumerarRegistros() {
  const filas = listarIdsRegistros.all() as Array<{ id: number }>;

  if (!filas.length) {
    reiniciarSecuenciaRegistros();
    return;
  }

  const { maximo } = maximoIdRegistro.get() as { maximo: number };
  const desplazamiento = Number(maximo) + 1;

  for (const fila of filas) {
    moverIdRegistro.run(fila.id + desplazamiento, fila.id);
  }

  filas.forEach((fila, indice) => {
    moverIdRegistro.run(indice + 1, fila.id + desplazamiento);
  });

  reiniciarSecuenciaRegistros();
}

const eliminarRegistroTransaccion = db.transaction((id: number) => {
  if (!borrarRegistro.run(id).changes) return false;

  renumerarRegistros();
  return true;
});

const vaciarRegistrosTransaccion = db.transaction(() => {
  const { changes } = borrarTodosLosRegistros.run();
  reiniciarSecuenciaRegistros();
  return changes;
});

export function eliminarRegistro(id: number): boolean {
  return eliminarRegistroTransaccion(id);
}

export function vaciarRegistros(): number {
  return vaciarRegistrosTransaccion();
}

export function insertarVivienda({
  estado = 'FALCÓN',
  municipio = 'MIRANDA',
  parroquia = 'SAN ANTONIO',
  comunidad,
  etapa = null,
  manzana = null,
  direccion,
  numero_casa = null,
  consejo_comunal_id = null,
  es_anexo = false,
  numero_anexo = null,
  vivienda_principal_id = null,
  sincronizar_neon = true,
}: {
  estado?: string;
  municipio?: string;
  parroquia?: string;
  comunidad: string;
  etapa?: string | null;
  manzana?: string | null;
  direccion: string;
  numero_casa?: string | null;
  consejo_comunal_id?: number | null;
  es_anexo?: boolean;
  numero_anexo?: string | null;
  vivienda_principal_id?: number | null;
  sincronizar_neon?: boolean;
}): number {
  const resultado = db
    .prepare(`
      INSERT INTO viviendas
        (estado, municipio, parroquia, comunidad, etapa, manzana, direccion, numero_casa,
         consejo_comunal_id, es_anexo, numero_anexo, vivienda_principal_id, sincronizar_neon)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      estado,
      municipio,
      parroquia,
      comunidad,
      etapa,
      manzana,
      direccion,
      numero_casa,
      consejo_comunal_id,
      es_anexo ? 1 : 0,
      numero_anexo,
      vivienda_principal_id,
      sincronizar_neon ? 1 : 0
    );
  return resultado.lastInsertRowid as number;
}

export function obtenerViviendaPorId(id: number): Vivienda | null {
  const fila = db
    .prepare('SELECT * FROM viviendas WHERE id = ?')
    .get(id) as any;
  return fila ? (fila as Vivienda) : null;
}

export function cambiarSincronizarNeon(id: number, sincronizar_neon: boolean): boolean {
  const resultado = db
    .prepare(`
      UPDATE viviendas
      SET sincronizar_neon = ?
      WHERE id = ?
    `)
    .run(sincronizar_neon ? 1 : 0, id);
  return resultado.changes > 0;
}

export function marcarSoloLocalParaSincronizar(): number {
  const resultado = db
    .prepare(`
      UPDATE viviendas
      SET sincronizar_neon = 1
      WHERE sincronizado = 0 AND sincronizar_neon = 0
    `)
    .run();
  return resultado.changes;
}

export type EliminacionNeon = {
  id: number;
  cedula: string;
};

// Cola de eliminaciones que no se pudieron propagar a Neon en el momento.
// Se reintentan al pulsar "Subir a Neon".
export function encolarEliminacionNeon(cedula: string): void {
  db.prepare(`
    INSERT INTO neon_eliminaciones (cedula)
    VALUES (?)
    ON CONFLICT(cedula) DO NOTHING
  `).run(cedula);
}

export function listarEliminacionesNeon(): EliminacionNeon[] {
  return db
    .prepare('SELECT id, cedula FROM neon_eliminaciones ORDER BY id')
    .all() as EliminacionNeon[];
}

export function eliminarEliminacionNeon(id: number): boolean {
  return db.prepare('DELETE FROM neon_eliminaciones WHERE id = ?').run(id).changes > 0;
}

export function marcarViviendaPendienteSincronizacion(id: number): boolean {
  return db
    .prepare(`
      UPDATE viviendas
      SET sincronizado = 0,
          sincronizado_en = NULL
      WHERE id = ?
    `)
    .run(id).changes > 0;
}

export function marcarViviendaSincronizada(id: number): boolean {
  return db
    .prepare(`
      UPDATE viviendas
      SET sincronizado = 1,
          sincronizado_en = datetime('now', 'localtime')
      WHERE id = ?
    `)
    .run(id).changes > 0;
}

export function obtenerViviendas({
  q = '',
  page = 1,
  limit = 20,
}: {
  q?: string;
  page?: number;
  limit?: number;
}): { viviendas: Vivienda[]; total: number } {
  const like = `%${q}%`;
  const offset = (page - 1) * limit;

  const filas = db
    .prepare(`
      SELECT * FROM viviendas
      WHERE comunidad LIKE ? OR manzana LIKE ? OR etapa LIKE ? OR direccion LIKE ? OR numero_casa LIKE ?
      ORDER BY fecha_registro DESC
      LIMIT ? OFFSET ?
    `)
    .all(like, like, like, like, like, limit, offset) as any[];

  const totalFila = db
    .prepare(`
      SELECT COUNT(*) AS total FROM viviendas
      WHERE comunidad LIKE ? OR manzana LIKE ? OR etapa LIKE ? OR direccion LIKE ? OR numero_casa LIKE ?
    `)
    .get(like, like, like, like, like) as { total: number };

  return {
    viviendas: filas as Vivienda[],
    total: totalFila.total,
  };
}

export function actualizarVivienda({
  id,
  estado,
  municipio,
  parroquia,
  comunidad,
  etapa,
  manzana,
  direccion,
  numero_casa,
  consejo_comunal_id,
  es_anexo,
  numero_anexo,
  vivienda_principal_id,
  sincronizar_neon,
}: {
  id: number;
  estado?: string;
  municipio?: string;
  parroquia?: string;
  comunidad?: string;
  etapa?: string | null;
  manzana?: string | null;
  direccion?: string;
  numero_casa?: string | null;
  consejo_comunal_id?: number | null;
  es_anexo?: boolean;
  numero_anexo?: string | null;
  vivienda_principal_id?: number | null;
  sincronizar_neon?: boolean;
}): boolean {
  const resultado = db
    .prepare(`
      UPDATE viviendas
      SET estado = COALESCE(?, estado),
          municipio = COALESCE(?, municipio),
          parroquia = COALESCE(?, parroquia),
          comunidad = COALESCE(?, comunidad),
          etapa = COALESCE(?, etapa),
          manzana = COALESCE(?, manzana),
          direccion = COALESCE(?, direccion),
          numero_casa = COALESCE(?, numero_casa),
          consejo_comunal_id = COALESCE(?, consejo_comunal_id),
          es_anexo = COALESCE(?, es_anexo),
          numero_anexo = COALESCE(?, numero_anexo),
          vivienda_principal_id = COALESCE(?, vivienda_principal_id),
          sincronizar_neon = COALESCE(?, sincronizar_neon),
          sincronizado = 0,
          sincronizado_en = NULL
      WHERE id = ?
    `)
    .run(
      estado,
      municipio,
      parroquia,
      comunidad,
      etapa,
      manzana,
      direccion,
      numero_casa,
      consejo_comunal_id,
      es_anexo === undefined ? null : es_anexo ? 1 : 0,
      numero_anexo,
      vivienda_principal_id,
      sincronizar_neon === undefined ? null : sincronizar_neon ? 1 : 0,
      id
    );
  return resultado.changes > 0;
}

const eliminarViviendaTransaccion = db.transaction((id: number) => {
  db.prepare('DELETE FROM integrantes_grupo_familiar WHERE vivienda_id = ?').run(id);
  db.prepare('DELETE FROM jefes_familia WHERE vivienda_id = ?').run(id);
  return db.prepare('DELETE FROM viviendas WHERE id = ?').run(id).changes > 0;
});

export function eliminarVivienda(id: number): boolean {
  return eliminarViviendaTransaccion(id);
}

export function insertarJefeFamilia({
  vivienda_id,
  cedula_tipo,
  cedula_numero,
  nombres,
  apellidos,
  fecha_nacimiento,
  sexo,
  telefono_movil = null,
  telefono_habitacion = null,
  telefono_trabajo = null,
  correo = null,
  nivel_instruccion,
  estado_civil,
  profesion = null,
  trabaja_actual,
  clasificacion_ingresos,
  frecuencia_ingresos = null,
  ingreso_mensual_bs = null,
}: {
  vivienda_id: number;
  cedula_tipo: CedulaTipo;
  cedula_numero: string | null;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  sexo: 'M' | 'F';
  telefono_movil?: string | null;
  telefono_habitacion?: string | null;
  telefono_trabajo?: string | null;
  correo?: string | null;
  nivel_instruccion: string;
  estado_civil: string;
  profesion?: string | null;
  trabaja_actual: 'Sí' | 'No';
  clasificacion_ingresos: string;
  frecuencia_ingresos?: string | null;
  ingreso_mensual_bs?: number | null;
}): number {
  const edad = calcularEdad(fecha_nacimiento);
  const resultado = db
    .prepare(`
      INSERT INTO jefes_familia
        (vivienda_id, cedula_tipo, cedula_numero, nombres, apellidos, fecha_nacimiento, edad, sexo,
         telefono_movil, telefono_habitacion, telefono_trabajo, correo, nivel_instruccion, estado_civil,
         profesion, trabaja_actual, clasificacion_ingresos, frecuencia_ingresos, ingreso_mensual_bs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      vivienda_id, cedula_tipo, cedula_numero, nombres, apellidos, fecha_nacimiento, edad, sexo,
      telefono_movil, telefono_habitacion, telefono_trabajo, correo, nivel_instruccion, estado_civil,
      profesion, trabaja_actual, clasificacion_ingresos, frecuencia_ingresos, ingreso_mensual_bs
    );
  return resultado.lastInsertRowid as number;
}

export function obtenerJefePorVivienda(viviendaId: number): JefeFamilia | null {
  const fila = db
    .prepare('SELECT * FROM jefes_familia WHERE vivienda_id = ?')
    .get(viviendaId) as any;
  return fila ? (fila as JefeFamilia) : null;
}

export function actualizarJefeFamilia({
  id,
  cedula_tipo,
  cedula_numero,
  nombres,
  apellidos,
  fecha_nacimiento,
  sexo,
  telefono_movil,
  telefono_habitacion,
  telefono_trabajo,
  correo,
  nivel_instruccion,
  estado_civil,
  profesion,
  trabaja_actual,
  clasificacion_ingresos,
  frecuencia_ingresos,
  ingreso_mensual_bs,
}: {
  id: number;
  cedula_tipo?: CedulaTipo;
  cedula_numero?: string | null;
  nombres?: string;
  apellidos?: string;
  fecha_nacimiento?: string;
  sexo?: 'M' | 'F';
  telefono_movil?: string | null;
  telefono_habitacion?: string | null;
  telefono_trabajo?: string | null;
  correo?: string | null;
  nivel_instruccion?: string;
  estado_civil?: string;
  profesion?: string | null;
  trabaja_actual?: 'Sí' | 'No';
  clasificacion_ingresos?: string;
  frecuencia_ingresos?: string | null;
  ingreso_mensual_bs?: number | null;
}): boolean {
  const jefe = obtenerJefePorVivienda(0);
  const fecha = fecha_nacimiento ?? (jefe ? '' : '');
  const edad = fecha_nacimiento ? calcularEdad(fecha_nacimiento) : undefined;

  const resultado = db
    .prepare(`
      UPDATE jefes_familia
      SET cedula_tipo = COALESCE(?, cedula_tipo),
          cedula_numero = CASE WHEN ? = 'S' THEN NULL ELSE COALESCE(?, cedula_numero) END,
          nombres = COALESCE(?, nombres),
          apellidos = COALESCE(?, apellidos),
          fecha_nacimiento = COALESCE(?, fecha_nacimiento),
          edad = COALESCE(?, edad),
          sexo = COALESCE(?, sexo),
          telefono_movil = COALESCE(?, telefono_movil),
          telefono_habitacion = COALESCE(?, telefono_habitacion),
          telefono_trabajo = COALESCE(?, telefono_trabajo),
          correo = COALESCE(?, correo),
          nivel_instruccion = COALESCE(?, nivel_instruccion),
          estado_civil = COALESCE(?, estado_civil),
          profesion = COALESCE(?, profesion),
          trabaja_actual = COALESCE(?, trabaja_actual),
          clasificacion_ingresos = COALESCE(?, clasificacion_ingresos),
          frecuencia_ingresos = COALESCE(?, frecuencia_ingresos),
          ingreso_mensual_bs = COALESCE(?, ingreso_mensual_bs)
      WHERE id = ?
    `)
    .run(
      cedula_tipo, cedula_tipo, cedula_numero, nombres, apellidos, fecha_nacimiento,
      edad, sexo, telefono_movil, telefono_habitacion, telefono_trabajo,
      correo, nivel_instruccion, estado_civil, profesion, trabaja_actual,
      clasificacion_ingresos, frecuencia_ingresos, ingreso_mensual_bs, id
    );
  return resultado.changes > 0;
}

export function insertarIntegrante({
  vivienda_id,
  numero,
  apellidos,
  nombres,
  cedula_tipo = null,
  cedula_numero = null,
  fecha_nacimiento = null,
  sexo = null,
  parentesco,
  nivel_instruccion = null,
  profesion = null,
  ingreso_mensual = null,
}: {
  vivienda_id: number;
  numero: number;
  apellidos: string;
  nombres: string;
  cedula_tipo?: CedulaTipo | null;
  cedula_numero?: string | null;
  fecha_nacimiento?: string | null;
  sexo?: 'M' | 'F' | null;
  parentesco: string;
  nivel_instruccion?: string | null;
  profesion?: string | null;
  ingreso_mensual?: number | null;
}): number {
  const edad = fecha_nacimiento ? calcularEdad(fecha_nacimiento) : null;
  const resultado = db
    .prepare(`
      INSERT INTO integrantes_grupo_familiar
        (vivienda_id, numero, apellidos, nombres, cedula_tipo, cedula_numero,
         fecha_nacimiento, edad, sexo, parentesco, nivel_instruccion, profesion, ingreso_mensual)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      vivienda_id, numero, apellidos, nombres, cedula_tipo, cedula_numero,
      fecha_nacimiento, edad, sexo, parentesco, nivel_instruccion, profesion, ingreso_mensual
    );
  return resultado.lastInsertRowid as number;
}

export function obtenerIntegrantePorId(id: number): IntegranteFamiliar | null {
  const fila = db
    .prepare('SELECT * FROM integrantes_grupo_familiar WHERE id = ?')
    .get(id) as any;
  return fila ? (fila as IntegranteFamiliar) : null;
}

export function obtenerIntegrantesPorVivienda(viviendaId: number): IntegranteFamiliar[] {
  const filas = db
    .prepare('SELECT * FROM integrantes_grupo_familiar WHERE vivienda_id = ? ORDER BY numero')
    .all(viviendaId) as any[];
  return filas as IntegranteFamiliar[];
}

export function actualizarIntegrante({
  id,
  numero,
  apellidos,
  nombres,
  cedula_tipo,
  cedula_numero,
  fecha_nacimiento,
  sexo,
  parentesco,
  nivel_instruccion,
  profesion,
  ingreso_mensual,
}: {
  id: number;
  numero?: number;
  apellidos?: string;
  nombres?: string;
  cedula_tipo?: CedulaTipo | null;
  cedula_numero?: string | null;
  fecha_nacimiento?: string | null;
  sexo?: 'M' | 'F' | null;
  parentesco?: string;
  nivel_instruccion?: string | null;
  profesion?: string | null;
  ingreso_mensual?: number | null;
}): boolean {
  const edad = fecha_nacimiento ? calcularEdad(fecha_nacimiento) : undefined;

  const resultado = db
    .prepare(`
      UPDATE integrantes_grupo_familiar
      SET numero = COALESCE(?, numero),
          apellidos = COALESCE(?, apellidos),
          nombres = COALESCE(?, nombres),
          cedula_tipo = COALESCE(?, cedula_tipo),
          cedula_numero = CASE WHEN ? = 'S' THEN NULL ELSE COALESCE(?, cedula_numero) END,
          fecha_nacimiento = COALESCE(?, fecha_nacimiento),
          edad = COALESCE(?, edad),
          sexo = COALESCE(?, sexo),
          parentesco = COALESCE(?, parentesco),
          nivel_instruccion = COALESCE(?, nivel_instruccion),
          profesion = COALESCE(?, profesion),
          ingreso_mensual = COALESCE(?, ingreso_mensual)
      WHERE id = ?
    `)
    .run(
      numero, apellidos, nombres, cedula_tipo, cedula_tipo, cedula_numero, fecha_nacimiento,
      edad, sexo, parentesco, nivel_instruccion, profesion, ingreso_mensual, id
    );
  return resultado.changes > 0;
}

export function eliminarIntegrante(id: number): boolean {
  const resultado = db
    .prepare('DELETE FROM integrantes_grupo_familiar WHERE id = ?')
    .run(id);
  return resultado.changes > 0;
}

export function eliminarJefeFamilia(id: number): boolean {
  return db.prepare('DELETE FROM jefes_familia WHERE id = ?').run(id).changes > 0;
}

export function obtenerExpedienteVivienda(viviendaId: number): {
  vivienda: Vivienda | null;
  jefe: JefeFamilia | null;
  integrantes: IntegranteFamiliar[];
} | null {
  const vivienda = obtenerViviendaPorId(viviendaId);
  if (!vivienda) return null;

  const jefe = obtenerJefePorVivienda(viviendaId);
  const integrantes = obtenerIntegrantesPorVivienda(viviendaId);

  return { vivienda, jefe, integrantes };
}

export function crearViviendaCompleta({
  vivienda,
  jefe,
  integrantes,
}: {
  vivienda: Omit<Vivienda, 'id' | 'fecha_registro' | 'sincronizado' | 'sincronizado_en'>;
  jefe: Omit<JefeFamilia, 'id' | 'vivienda_id' | 'edad'>;
  integrantes: Array<Omit<IntegranteFamiliar, 'id' | 'vivienda_id' | 'edad'>>;
}): { viviendaId: number; jefeId: number; integrantesIds: number[] } {
  return db.transaction(() => {
    const viviendaId = insertarVivienda(vivienda);
    const jefeId = insertarJefeFamilia({ ...jefe, vivienda_id: viviendaId });

    const integrantesIds: number[] = [];
    for (const integrante of integrantes) {
      integrantesIds.push(
        insertarIntegrante({ ...integrante, vivienda_id: viviendaId })
      );
    }

    return { viviendaId, jefeId, integrantesIds };
  })();
}

// ============================================================================
// CONSEJOS COMUNALES Y BÚSQUEDA DE VIVIENDA PRINCIPAL
// ============================================================================

export function listarConsejosComunales(
  { soloActivos = true }: { soloActivos?: boolean } = {}
): ConsejoComunal[] {
  const filtro = soloActivos ? 'WHERE activo = 1' : '';
  const filas = db
    .prepare(`
      SELECT * FROM consejos_comunales
      ${filtro}
      ORDER BY nombre COLLATE NOCASE
    `)
    .all() as any[];

  return filas.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    sector: fila.sector ?? null,
    activo: Boolean(fila.activo),
  }));
}

export function obtenerConsejoComunalPorId(id: number): ConsejoComunal | null {
  const fila = db
    .prepare('SELECT * FROM consejos_comunales WHERE id = ?')
    .get(id) as any;
  if (!fila) return null;

  return {
    id: fila.id,
    nombre: fila.nombre,
    sector: fila.sector ?? null,
    activo: Boolean(fila.activo),
  };
}

export function crearConsejoComunal({
  nombre,
  sector = null,
  activo = true,
}: {
  nombre: string;
  sector?: string | null;
  activo?: boolean;
}): number {
  const resultado = db
    .prepare(`
      INSERT OR IGNORE INTO consejos_comunales (nombre, sector, activo)
      VALUES (?, ?, ?)
    `)
    .run(nombre, sector, activo ? 1 : 0);
  if (resultado.changes === 0) {
    db.prepare(`
      UPDATE consejos_comunales
      SET sector = COALESCE(?, sector), activo = ?
      WHERE nombre = ? COLLATE NOCASE
    `).run(sector, activo ? 1 : 0, nombre);
    const fila = db
      .prepare('SELECT id FROM consejos_comunales WHERE nombre = ? COLLATE NOCASE')
      .get(nombre) as { id: number } | undefined;
    return fila ? fila.id : 0;
  }
  return Number(resultado.lastInsertRowid);
}

export type ViviendaPrincipalBusqueda = {
  id: number;
  direccion: string;
  numero_casa: string | null;
  comunidad: string;
  etapa: string | null;
  manzana: string | null;
  jefe_nombres: string;
  jefe_apellidos: string;
  jefe_cedula: string;
};

export function buscarViviendasPrincipales(q: string, limite = 15): ViviendaPrincipalBusqueda[] {
  const like = `%${q.trim()}%`;
  const filas = db
    .prepare(`
      SELECT v.id, v.direccion, v.numero_casa, v.comunidad, v.etapa, v.manzana,
             j.nombres AS jefe_nombres, j.apellidos AS jefe_apellidos,
             j.cedula_tipo, j.cedula_numero
      FROM viviendas v
      LEFT JOIN jefes_familia j ON j.vivienda_id = v.id
      WHERE COALESCE(v.es_anexo, 0) = 0
        AND (
          v.direccion LIKE ? OR v.numero_casa LIKE ? OR v.comunidad LIKE ?
          OR j.nombres LIKE ? OR j.apellidos LIKE ? OR j.cedula_numero LIKE ?
        )
      ORDER BY v.id DESC
      LIMIT ?
    `)
    .all(like, like, like, like, like, like, limite) as any[];

  return filas.map((fila) => ({
    id: fila.id,
    direccion: fila.direccion,
    numero_casa: fila.numero_casa ?? null,
    comunidad: fila.comunidad,
    etapa: fila.etapa ?? null,
    manzana: fila.manzana ?? null,
    jefe_nombres: fila.jefe_nombres ?? '',
    jefe_apellidos: fila.jefe_apellidos ?? '',
    jefe_cedula:
      (fila.cedula_tipo === 'V' || fila.cedula_tipo === 'E') && fila.cedula_numero
        ? `${fila.cedula_tipo}-${fila.cedula_numero}`
        : 'Sin cédula',
  }));
}

// ============================================================================
// USUARIOS
// ============================================================================

function formatearUsuario(fila: any): Usuario {
  return {
    id: fila.id,
    usuario: fila.usuario,
    nombre: fila.nombre,
    rol: fila.rol,
    activo: Boolean(fila.activo),
    creado_en: fila.creado_en,
  };
}

export function listarUsuarios(): Usuario[] {
  const filas = db
    .prepare('SELECT * FROM usuarios ORDER BY rol, usuario')
    .all() as any[];
  return filas.map(formatearUsuario);
}

export function obtenerUsuarioPorId(id: number): Usuario | null {
  const fila = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id) as any;
  return fila ? formatearUsuario(fila) : null;
}

export function obtenerUsuarioPorUsuario(
  usuario: string
): (Usuario & { clave_hash: string }) | null {
  const fila = db
    .prepare('SELECT * FROM usuarios WHERE usuario = ? COLLATE NOCASE')
    .get(usuario) as any;
  if (!fila) return null;
  return { ...formatearUsuario(fila), clave_hash: fila.clave_hash };
}

export function crearUsuario({
  usuario,
  nombre,
  clave,
  rol,
}: {
  usuario: string;
  nombre: string;
  clave: string;
  rol: 'admin' | 'gestor';
}): number {
  const resultado = db
    .prepare(`
      INSERT INTO usuarios (usuario, nombre, clave_hash, rol)
      VALUES (?, ?, ?, ?)
    `)
    .run(usuario, nombre, hashClave(clave), rol);
  return resultado.lastInsertRowid as number;
}

export function actualizarUsuario({
  id,
  nombre,
  rol,
  activo,
  clave,
}: {
  id: number;
  nombre?: string;
  rol?: 'admin' | 'gestor';
  activo?: boolean;
  clave?: string | null;
}): boolean {
  const actual = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id) as any;
  if (!actual) return false;

  const resultado = db
    .prepare(`
      UPDATE usuarios
      SET nombre = COALESCE(?, nombre),
          rol = COALESCE(?, rol),
          activo = COALESCE(?, activo),
          clave_hash = COALESCE(?, clave_hash)
      WHERE id = ?
    `)
    .run(
      nombre ?? null,
      rol ?? null,
      activo === undefined ? null : activo ? 1 : 0,
      clave ? hashClave(clave) : null,
      id
    );
  return resultado.changes > 0;
}

export function eliminarUsuario(id: number): boolean {
  return db.prepare('DELETE FROM usuarios WHERE id = ?').run(id).changes > 0;
}

export function contarAdminsActivos(): number {
  const { total } = db
    .prepare("SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'admin' AND activo = 1")
    .get() as { total: number };
  return total;
}

// ============================================================================
// TERRITORIOS
// ============================================================================

const TIPOS_TERRITORIO: TipoTerritorio[] = [
  'estado',
  'municipio',
  'parroquia',
  'comunidad',
  'etapa',
  'manzana',
];

function formatearTerritorio(fila: any): Territorio {
  return {
    id: fila.id,
    tipo: fila.tipo,
    nombre: fila.nombre,
    padre_id: fila.padre_id,
    padre_nombre: fila.padre_nombre ?? null,
    activo: Boolean(fila.activo),
    orden: fila.orden,
  };
}

export function listarTerritorios({
  tipo = null,
  padreId = null,
  soloActivos = true,
}: {
  tipo?: TipoTerritorio | null;
  padreId?: number | null;
  soloActivos?: boolean;
} = {}): Territorio[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (tipo) {
    where.push('t.tipo = ?');
    params.push(tipo);
  }
  if (padreId !== null && padreId !== undefined) {
    where.push('t.padre_id = ?');
    params.push(padreId);
  }
  if (soloActivos) {
    where.push('t.activo = 1');
  }

  const condicion = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const filas = db
    .prepare(`
      SELECT t.*, p.nombre AS padre_nombre
      FROM territorios t
      LEFT JOIN territorios p ON p.id = t.padre_id
      ${condicion}
      ORDER BY t.tipo, t.orden, t.nombre COLLATE NOCASE
    `)
    .all(...params) as any[];

  return filas.map(formatearTerritorio);
}

export function obtenerTerritorioPorId(id: number): Territorio | null {
  const fila = db
    .prepare(`
      SELECT t.*, p.nombre AS padre_nombre
      FROM territorios t
      LEFT JOIN territorios p ON p.id = t.padre_id
      WHERE t.id = ?
    `)
    .get(id) as any;
  return fila ? formatearTerritorio(fila) : null;
}

export function crearTerritorio({
  tipo,
  nombre,
  padre_id = null,
}: {
  tipo: TipoTerritorio;
  nombre: string;
  padre_id?: number | null;
}): number {
  if (!TIPOS_TERRITORIO.includes(tipo)) {
    throw new Error('Tipo de territorio inválido.');
  }

  const resultado = db
    .prepare(`
      INSERT INTO territorios (tipo, nombre, padre_id, orden)
      VALUES (?, ?, ?, (SELECT COALESCE(MAX(orden), 0) + 10 FROM territorios WHERE tipo = ?))
    `)
    .run(tipo, nombre, padre_id, tipo);
  return resultado.lastInsertRowid as number;
}

export function actualizarTerritorio({
  id,
  nombre,
  padre_id,
  activo,
}: {
  id: number;
  nombre?: string;
  padre_id?: number | null;
  activo?: boolean;
}): boolean {
  const resultado = db
    .prepare(`
      UPDATE territorios
      SET nombre = COALESCE(?, nombre),
          padre_id = COALESCE(?, padre_id),
          activo = COALESCE(?, activo)
      WHERE id = ?
    `)
    .run(
      nombre ?? null,
      padre_id === undefined ? null : padre_id,
      activo === undefined ? null : activo ? 1 : 0,
      id
    );
  return resultado.changes > 0;
}

export function eliminarTerritorio(id: number): boolean {
  return db.prepare('DELETE FROM territorios WHERE id = ?').run(id).changes > 0;
}

// ============================================================================
// CONFIGURACIÓN DE CAMPOS DEL CENSO
// ============================================================================

export function listarConfigCampos(): ConfigCampo[] {
  const filas = db
    .prepare('SELECT * FROM config_campos_censo ORDER BY seccion, orden, clave')
    .all() as any[];

  return filas.map((fila) => ({
    clave: fila.clave,
    etiqueta: fila.etiqueta,
    seccion: fila.seccion,
    visible: Boolean(fila.visible),
    requerido: Boolean(fila.requerido),
    orden: fila.orden,
  }));
}

export function obtenerConfigCamposMap(): Record<
  string,
  { visible: boolean; requerido: boolean }
> {
  const mapa: Record<string, { visible: boolean; requerido: boolean }> = {};
  for (const campo of listarConfigCampos()) {
    mapa[campo.clave] = { visible: campo.visible, requerido: campo.requerido };
  }
  return mapa;
}

export function actualizarConfigCampo({
  clave,
  visible,
  requerido,
}: {
  clave: string;
  visible?: boolean;
  requerido?: boolean;
}): boolean {
  const resultado = db
    .prepare(`
      UPDATE config_campos_censo
      SET visible = COALESCE(?, visible),
          requerido = COALESCE(?, requerido)
      WHERE clave = ?
    `)
    .run(
      visible === undefined ? null : visible ? 1 : 0,
      requerido === undefined ? null : requerido ? 1 : 0,
      clave
    );
  return resultado.changes > 0;
}

// ============================================================================
// OPCIONES DE CAMPOS CONFIGURABLES (listas desplegables)
// ============================================================================

export type OpcionCampo = {
  id: number;
  campo: string;
  valor: string;
  etiqueta: string;
  orden: number;
  activo: boolean;
};

export const CAMPOS_OPCIONES: Record<string, string> = {
  sexo: 'Sexo',
  nivel_instruccion: 'Nivel de instrucción',
  estado_civil: 'Estado civil',
  parentesco: 'Parentesco',
  clasificacion_ingresos: 'Clasificación de ingresos',
  frecuencia_ingresos: 'Frecuencia de ingresos',
  trabaja_actual: '¿Trabaja actualmente?',
};

function formatearOpcionCampo(fila: any): OpcionCampo {
  return {
    id: fila.id,
    campo: fila.campo,
    valor: fila.valor,
    etiqueta: fila.etiqueta || fila.valor,
    orden: fila.orden,
    activo: Boolean(fila.activo),
  };
}

export function listarOpcionesCampo(
  campo: string,
  { soloActivas = true }: { soloActivas?: boolean } = {}
): OpcionCampo[] {
  const filtro = soloActivas ? 'AND activo = 1' : '';
  const filas = db
    .prepare(`
      SELECT * FROM opciones_campos
      WHERE campo = ? ${filtro}
      ORDER BY orden, valor COLLATE NOCASE
    `)
    .all(campo) as any[];
  return filas.map(formatearOpcionCampo);
}

// Devuelve todas las listas que consume el formulario de registro.
export function listarOpcionesFormulario(): Record<string, OpcionCampo[]> {
  const opciones: Record<string, OpcionCampo[]> = {};
  for (const campo of Object.keys(CAMPOS_OPCIONES)) {
    opciones[campo] = listarOpcionesCampo(campo);
  }
  return opciones;
}

export function listarCamposConOpciones(): string[] {
  const filas = db
    .prepare('SELECT DISTINCT campo FROM opciones_campos ORDER BY campo COLLATE NOCASE')
    .all() as Array<{ campo: string }>;
  return filas.map((fila) => fila.campo);
}

export function obtenerOpcionCampoPorId(id: number): OpcionCampo | null {
  const fila = db.prepare('SELECT * FROM opciones_campos WHERE id = ?').get(id) as any;
  return fila ? formatearOpcionCampo(fila) : null;
}

export function crearOpcionCampo({
  campo,
  valor,
  etiqueta = null,
  orden = 0,
  activo = true,
}: {
  campo: string;
  valor: string;
  etiqueta?: string | null;
  orden?: number;
  activo?: boolean;
}): number {
  const resultado = db
    .prepare(`
      INSERT OR IGNORE INTO opciones_campos (campo, valor, etiqueta, orden, activo)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(campo, valor, etiqueta, orden, activo ? 1 : 0);

  if (resultado.changes === 0) {
    db.prepare(`
      UPDATE opciones_campos
      SET etiqueta = COALESCE(?, etiqueta), orden = ?, activo = ?
      WHERE campo = ? AND valor = ?
    `).run(etiqueta, orden, activo ? 1 : 0, campo, valor);
    const fila = db
      .prepare('SELECT id FROM opciones_campos WHERE campo = ? AND valor = ?')
      .get(campo, valor) as { id: number } | undefined;
    return fila ? fila.id : 0;
  }

  return Number(resultado.lastInsertRowid);
}

export function actualizarOpcionCampo({
  id,
  valor,
  etiqueta,
  orden,
  activo,
}: {
  id: number;
  valor?: string;
  etiqueta?: string | null;
  orden?: number;
  activo?: boolean;
}): boolean {
  const resultado = db
    .prepare(`
      UPDATE opciones_campos
      SET valor = COALESCE(?, valor),
          etiqueta = COALESCE(?, etiqueta),
          orden = COALESCE(?, orden),
          activo = COALESCE(?, activo)
      WHERE id = ?
    `)
    .run(
      valor ?? null,
      etiqueta === undefined ? null : etiqueta,
      orden === undefined ? null : orden,
      activo === undefined ? null : activo ? 1 : 0,
      id
    );
  return resultado.changes > 0;
}

export function cambiarEstadoOpcionCampo(id: number): boolean {
  return (
    db
      .prepare('UPDATE opciones_campos SET activo = CASE activo WHEN 1 THEN 0 ELSE 1 END WHERE id = ?')
      .run(id).changes > 0
  );
}

export function eliminarOpcionCampo(id: number): boolean {
  return db.prepare('DELETE FROM opciones_campos WHERE id = ?').run(id).changes > 0;
}

// ============================================================================
// VISTA UNIFICADA DE PERSONAS
// ============================================================================

export function obtenerPersonas(
  filtros: {
    q?: string;
    sexo?: string;
    edadMin?: number | null;
    edadMax?: number | null;
    nivel?: string;
    trabaja?: string;
    parentesco?: string;
    manzana?: string;
    etapa?: string;
    comunidad?: string;
    tipo?: string;
  } = {}
): { personas: PersonaIndividual[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];

  const q = (filtros.q || '').trim();
  if (q) {
    const like = `%${q}%`;
    where.push(`(
      nombres LIKE ? OR apellidos LIKE ? OR cedula LIKE ? OR
      CAST(edad AS TEXT) LIKE ? OR manzana LIKE ? OR comunidad LIKE ?
    )`);
    params.push(like, like, like, like, like, like);
  }

  if (filtros.sexo) {
    where.push('sexo = ?');
    params.push(filtros.sexo);
  }
  if (filtros.edadMin !== null && filtros.edadMin !== undefined) {
    where.push('edad >= ?');
    params.push(filtros.edadMin);
  }
  if (filtros.edadMax !== null && filtros.edadMax !== undefined) {
    where.push('edad <= ?');
    params.push(filtros.edadMax);
  }
  if (filtros.nivel) {
    where.push('nivel_instruccion = ?');
    params.push(filtros.nivel);
  }
  if (filtros.trabaja) {
    where.push('trabaja_actual = ?');
    params.push(filtros.trabaja);
  }
  if (filtros.parentesco) {
    where.push('parentesco = ?');
    params.push(filtros.parentesco);
  }
  if (filtros.manzana) {
    where.push('manzana = ?');
    params.push(filtros.manzana);
  }
  if (filtros.etapa) {
    where.push('etapa = ?');
    params.push(filtros.etapa);
  }
  if (filtros.comunidad) {
    where.push('comunidad = ?');
    params.push(filtros.comunidad);
  }
  if (filtros.tipo) {
    where.push('tipo = ?');
    params.push(filtros.tipo);
  }

  const condicion = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const filas = db
    .prepare(`
      SELECT * FROM vista_personas_individuales
      ${condicion}
      ORDER BY apellidos COLLATE NOCASE, nombres COLLATE NOCASE
    `)
    .all(...params) as any[];

  return { personas: filas as PersonaIndividual[], total: filas.length };
}

export function obtenerPersonaIndividual(
  tipo: string,
  id: number
): PersonaIndividual | null {
  if (tipo !== 'jefe' && tipo !== 'integrante') return null;
  const fila = db
    .prepare(`
      SELECT * FROM vista_personas_individuales
      WHERE tipo = ? AND persona_id = ?
    `)
    .get(tipo, id) as any;
  return fila ? (fila as PersonaIndividual) : null;
}

export function contarPersonas(): number {
  const { total } = db
    .prepare('SELECT COUNT(*) AS total FROM vista_personas_individuales')
    .get() as { total: number };
  return total;
}

export function contarViviendas(): number {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM viviendas').get() as {
    total: number;
  };
  return total;
}

export function obtenerEstadisticasViviendas(): {
  total: number;
  pendientes: number;
  sincronizados: number;
  solo_local: number;
  personas: number;
} {
  const fila = db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN sincronizado = 0 AND sincronizar_neon = 1 THEN 1 ELSE 0 END), 0) AS pendientes,
        COALESCE(SUM(CASE WHEN sincronizado = 1 THEN 1 ELSE 0 END), 0) AS sincronizados,
        COALESCE(SUM(CASE WHEN sincronizado = 0 AND sincronizar_neon = 0 THEN 1 ELSE 0 END), 0) AS solo_local
      FROM viviendas
    `)
    .get() as { total: number; pendientes: number; sincronizados: number; solo_local: number };

  return { ...fila, personas: contarPersonas() };
}

function reiniciarSecuencia(tabla: string) {
  const resultado = db
    .prepare('UPDATE sqlite_sequence SET seq = 0 WHERE name = ?')
    .run(tabla);

  if (resultado.changes === 0) {
    db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, 0)').run(tabla);
  }
}

// Borra todos los datos del censo conservando usuarios, territorios y configuración.
export function vaciarBaseDatos(): { viviendas: number; personas: number } {
  return db.transaction(() => {
    const personas =
      (db.prepare('SELECT COUNT(*) AS total FROM jefes_familia').get() as { total: number }).total +
      (db.prepare('SELECT COUNT(*) AS total FROM integrantes_grupo_familiar').get() as { total: number }).total;
    const viviendas = (db.prepare('SELECT COUNT(*) AS total FROM viviendas').get() as { total: number }).total;

    db.prepare('DELETE FROM integrantes_grupo_familiar').run();
    db.prepare('DELETE FROM jefes_familia').run();
    db.prepare('DELETE FROM viviendas').run();
    db.prepare('DELETE FROM registros_censo').run();
    db.prepare('DELETE FROM neon_eliminaciones').run();

    reiniciarSecuencia('integrantes_grupo_familiar');
    reiniciarSecuencia('jefes_familia');
    reiniciarSecuencia('viviendas');
    reiniciarSecuencia('registros_censo');

    return { viviendas, personas };
  })();
}

module.exports = {
  db,
  rutaBaseDatos,
  CLAVES_RESERVADAS,
  TIPOS_CAMPO,
  obtenerCampos,
  obtenerCamposFormulario,
  obtenerRegistros,
  obtenerRegistroPorId,
  obtenerEstadisticas,
  insertarRegistro,
  actualizarRegistro,
  eliminarRegistro,
  vaciarRegistros,
  crearCampo,
  obtenerCampoPorId,
  actualizarCampo,
  cambiarEstadoCampo,
  eliminarCampo,
  renumerarRegistros,
  insertarVivienda,
  obtenerViviendaPorId,
  obtenerViviendas,
  actualizarVivienda,
  eliminarVivienda,
  cambiarSincronizarNeon,
  marcarSoloLocalParaSincronizar,
  encolarEliminacionNeon,
  listarEliminacionesNeon,
  eliminarEliminacionNeon,
  marcarViviendaPendienteSincronizacion,
  marcarViviendaSincronizada,
  insertarJefeFamilia,
  obtenerJefePorVivienda,
  actualizarJefeFamilia,
  insertarIntegrante,
  obtenerIntegrantePorId,
  obtenerIntegrantesPorVivienda,
  actualizarIntegrante,
  eliminarIntegrante,
  eliminarJefeFamilia,
  obtenerExpedienteVivienda,
  crearViviendaCompleta,
  listarConsejosComunales,
  obtenerConsejoComunalPorId,
  crearConsejoComunal,
  buscarViviendasPrincipales,
  listarUsuarios,
  obtenerUsuarioPorId,
  obtenerUsuarioPorUsuario,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
  contarAdminsActivos,
  listarTerritorios,
  obtenerTerritorioPorId,
  crearTerritorio,
  actualizarTerritorio,
  eliminarTerritorio,
  listarConfigCampos,
  obtenerConfigCamposMap,
  actualizarConfigCampo,
  listarOpcionesCampo,
  listarOpcionesFormulario,
  listarCamposConOpciones,
  obtenerOpcionCampoPorId,
  crearOpcionCampo,
  actualizarOpcionCampo,
  cambiarEstadoOpcionCampo,
  eliminarOpcionCampo,
  CAMPOS_OPCIONES,
  obtenerPersonas,
  obtenerPersonaIndividual,
  contarPersonas,
  contarViviendas,
  obtenerEstadisticasViviendas,
  vaciarBaseDatos,
  Vivienda: null as unknown as Vivienda,
  JefeFamilia: null as unknown as JefeFamilia,
  IntegranteFamiliar: null as unknown as IntegranteFamiliar,
};
