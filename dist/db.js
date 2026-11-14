"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIPOS_CAMPO = exports.CLAVES_RESERVADAS = exports.db = exports.rutaBaseDatos = void 0;
exports.obtenerCampos = obtenerCampos;
exports.obtenerCamposFormulario = obtenerCamposFormulario;
exports.obtenerRegistros = obtenerRegistros;
exports.obtenerRegistroPorId = obtenerRegistroPorId;
exports.obtenerEstadisticas = obtenerEstadisticas;
exports.crearCampo = crearCampo;
exports.obtenerCampoPorId = obtenerCampoPorId;
exports.actualizarCampo = actualizarCampo;
exports.cambiarEstadoCampo = cambiarEstadoCampo;
exports.eliminarCampo = eliminarCampo;
exports.renumerarRegistros = renumerarRegistros;
exports.eliminarRegistro = eliminarRegistro;
exports.vaciarRegistros = vaciarRegistros;
exports.insertarVivienda = insertarVivienda;
exports.obtenerViviendaPorId = obtenerViviendaPorId;
exports.cambiarSincronizarNeon = cambiarSincronizarNeon;
exports.marcarSoloLocalParaSincronizar = marcarSoloLocalParaSincronizar;
exports.encolarEliminacionNeon = encolarEliminacionNeon;
exports.listarEliminacionesNeon = listarEliminacionesNeon;
exports.eliminarEliminacionNeon = eliminarEliminacionNeon;
exports.marcarViviendaPendienteSincronizacion = marcarViviendaPendienteSincronizacion;
exports.marcarViviendaSincronizada = marcarViviendaSincronizada;
exports.obtenerViviendas = obtenerViviendas;
exports.actualizarVivienda = actualizarVivienda;
exports.eliminarVivienda = eliminarVivienda;
exports.insertarJefeFamilia = insertarJefeFamilia;
exports.obtenerJefePorVivienda = obtenerJefePorVivienda;
exports.actualizarJefeFamilia = actualizarJefeFamilia;
exports.insertarIntegrante = insertarIntegrante;
exports.obtenerIntegrantePorId = obtenerIntegrantePorId;
exports.obtenerIntegrantesPorVivienda = obtenerIntegrantesPorVivienda;
exports.actualizarIntegrante = actualizarIntegrante;
exports.eliminarIntegrante = eliminarIntegrante;
exports.eliminarJefeFamilia = eliminarJefeFamilia;
exports.obtenerExpedienteVivienda = obtenerExpedienteVivienda;
exports.crearViviendaCompleta = crearViviendaCompleta;
exports.listarConsejosComunales = listarConsejosComunales;
exports.obtenerConsejoComunalPorId = obtenerConsejoComunalPorId;
exports.crearConsejoComunal = crearConsejoComunal;
exports.buscarViviendasPrincipales = buscarViviendasPrincipales;
exports.listarUsuarios = listarUsuarios;
exports.obtenerUsuarioPorId = obtenerUsuarioPorId;
exports.obtenerUsuarioPorUsuario = obtenerUsuarioPorUsuario;
exports.crearUsuario = crearUsuario;
exports.actualizarUsuario = actualizarUsuario;
exports.eliminarUsuario = eliminarUsuario;
exports.contarAdminsActivos = contarAdminsActivos;
exports.listarTerritorios = listarTerritorios;
exports.obtenerTerritorioPorId = obtenerTerritorioPorId;
exports.crearTerritorio = crearTerritorio;
exports.actualizarTerritorio = actualizarTerritorio;
exports.eliminarTerritorio = eliminarTerritorio;
exports.listarConfigCampos = listarConfigCampos;
exports.obtenerConfigCamposMap = obtenerConfigCamposMap;
exports.actualizarConfigCampo = actualizarConfigCampo;
exports.obtenerPersonas = obtenerPersonas;
exports.obtenerPersonaIndividual = obtenerPersonaIndividual;
exports.contarPersonas = contarPersonas;
exports.contarViviendas = contarViviendas;
exports.obtenerEstadisticasViviendas = obtenerEstadisticasViviendas;
exports.vaciarBaseDatos = vaciarBaseDatos;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const auth_1 = require("./auth");
dotenv_1.default.config({ quiet: true });
exports.rutaBaseDatos = process.env.DB_PATH
    ? path_1.default.resolve(process.env.DB_PATH)
    : path_1.default.join(process.cwd(), 'comuna_carabobo200.db');
exports.db = new better_sqlite3_1.default(exports.rutaBaseDatos);
exports.db.pragma('journal_mode = WAL');
exports.db.pragma('synchronous = NORMAL');
exports.db.pragma('busy_timeout = 5000');
exports.db.exec(`
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
    const columnas = exports.db.prepare('PRAGMA table_info(viviendas)').all();
    const nombres = columnas.map((columna) => columna.name);
    if (!nombres.includes('sincronizar_neon')) {
        exports.db.exec(`
      ALTER TABLE viviendas ADD COLUMN sincronizar_neon INTEGER NOT NULL DEFAULT 1 CHECK (sincronizar_neon IN (0, 1))
    `);
    }
}
asegurarColumnaSincronizarNeon();
// Agrega a bases ya existentes las columnas de consejo comunal, anexos e
// ingresos que usan el escaneo inteligente y el formulario de vivienda.
function asegurarColumnasNuevas() {
    const columnasDe = (tabla) => exports.db.prepare(`PRAGMA table_info(${tabla})`).all().map((columna) => columna.name);
    const viviendas = columnasDe('viviendas');
    if (!viviendas.includes('consejo_comunal_id')) {
        exports.db.exec('ALTER TABLE viviendas ADD COLUMN consejo_comunal_id INTEGER REFERENCES consejos_comunales(id) ON DELETE SET NULL');
    }
    if (!viviendas.includes('es_anexo')) {
        exports.db.exec('ALTER TABLE viviendas ADD COLUMN es_anexo INTEGER NOT NULL DEFAULT 0 CHECK (es_anexo IN (0, 1))');
    }
    if (!viviendas.includes('numero_anexo')) {
        exports.db.exec('ALTER TABLE viviendas ADD COLUMN numero_anexo TEXT');
    }
    if (!viviendas.includes('vivienda_principal_id')) {
        exports.db.exec('ALTER TABLE viviendas ADD COLUMN vivienda_principal_id INTEGER REFERENCES viviendas(id) ON DELETE SET NULL');
    }
    if (!columnasDe('jefes_familia').includes('ingreso_mensual_bs')) {
        exports.db.exec('ALTER TABLE jefes_familia ADD COLUMN ingreso_mensual_bs REAL');
    }
    if (!columnasDe('integrantes_grupo_familiar').includes('ingreso_mensual')) {
        exports.db.exec('ALTER TABLE integrantes_grupo_familiar ADD COLUMN ingreso_mensual REAL');
    }
}
asegurarColumnasNuevas();
// Habilita el tipo de cédula 'S' ("Sin cédula") en bases ya creadas. SQLite no
// permite modificar un CHECK, así que hay que reconstruir las dos tablas.
function tablaAdmiteSinCedula(nombre) {
    const fila = exports.db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(nombre);
    return !fila || /'S'/.test(fila.sql);
}
function asegurarTipoSinCedula() {
    const faltaJefes = !tablaAdmiteSinCedula('jefes_familia');
    const faltaIntegrantes = !tablaAdmiteSinCedula('integrantes_grupo_familiar');
    if (!faltaJefes && !faltaIntegrantes)
        return;
    // La vista se recrea más abajo al cargar el módulo, pero impide reconstruir
    // las tablas si sigue existiendo.
    exports.db.exec('DROP VIEW IF EXISTS vista_personas_individuales');
    exports.db.pragma('foreign_keys = OFF');
    const migrar = exports.db.transaction(() => {
        if (faltaJefes) {
            exports.db.exec(`
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
            exports.db.exec(`
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
    }
    finally {
        exports.db.pragma('foreign_keys = ON');
    }
}
asegurarTipoSinCedula();
// ============================================================================
// ESQUEMA: USUARIOS, TERRITORIOS, CONFIGURACIÓN DE CAMPOS Y VISTA UNIFICADA
// ============================================================================
exports.db.exec(`
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
const CONFIG_CAMPOS_INICIALES = [
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
const insertarConfigCampo = exports.db.prepare(`
  INSERT OR IGNORE INTO config_campos_censo (clave, etiqueta, seccion, requerido, orden)
  VALUES (@clave, @etiqueta, @seccion, @requerido, @orden)
`);
exports.db.transaction((campos) => {
    for (const campo of campos)
        insertarConfigCampo.run(campo);
})(CONFIG_CAMPOS_INICIALES);
function sembrarTerritoriosIniciales() {
    const { total } = exports.db.prepare('SELECT COUNT(*) AS total FROM territorios').get();
    if (total > 0)
        return;
    const insertar = exports.db.prepare('INSERT INTO territorios (tipo, nombre, padre_id, orden) VALUES (?, ?, ?, ?)');
    exports.db.transaction(() => {
        const estado = Number(insertar.run('estado', 'FALCÓN', null, 10).lastInsertRowid);
        const municipio = Number(insertar.run('municipio', 'MIRANDA', estado, 10).lastInsertRowid);
        const parroquia = Number(insertar.run('parroquia', 'SAN ANTONIO', municipio, 10).lastInsertRowid);
        const comunidad = Number(insertar.run('comunidad', 'Carabobo 200', parroquia, 10).lastInsertRowid);
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
    exports.db.prepare(`
    INSERT OR IGNORE INTO consejos_comunales (nombre)
    SELECT DISTINCT nombre FROM territorios
    WHERE tipo = 'comunidad' AND TRIM(nombre) <> ''
  `).run();
    exports.db.prepare(`
    INSERT OR IGNORE INTO consejos_comunales (nombre)
    SELECT DISTINCT comunidad FROM viviendas
    WHERE comunidad IS NOT NULL AND TRIM(comunidad) <> ''
  `).run();
}
sembrarConsejosComunales();
function sembrarAdminInicial() {
    const { total } = exports.db.prepare('SELECT COUNT(*) AS total FROM usuarios').get();
    if (total > 0)
        return;
    const usuario = (process.env.ADMIN_USUARIO || 'admin').trim();
    const clave = process.env.ADMIN_CLAVE || process.env.CLAVE_ADMIN || 'csc200';
    exports.db.prepare(`
    INSERT INTO usuarios (usuario, nombre, clave_hash, rol)
    VALUES (?, ?, ?, 'admin')
  `).run(usuario, 'Administrador', (0, auth_1.hashClave)(clave));
}
sembrarAdminInicial();
exports.db.exec(`
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
        opciones: null,
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
exports.CLAVES_RESERVADAS = [
    'id',
    'cedula',
    'nombres',
    'apellidos',
    'fecha_nacimiento',
    'datos_extras',
    'sincronizado',
    'sincronizado_en',
];
exports.TIPOS_CAMPO = ['text', 'number', 'date', 'tel', 'email', 'textarea', 'select'];
const insertarCampoInicial = exports.db.prepare(`
  INSERT OR IGNORE INTO campos_formulario
    (clave, etiqueta, tipo, opciones, requerido, ayuda, orden)
  VALUES
    (@clave, @etiqueta, @tipo, @opciones, @requerido, @ayuda, @orden)
`);
const sembrarCampos = exports.db.transaction((campos) => {
    for (const campo of campos) {
        insertarCampoInicial.run({
            ...campo,
            opciones: campo.opciones ? JSON.stringify(campo.opciones) : null,
        });
    }
});
sembrarCampos(CAMPOS_INICIALES);
function deserializarOpciones(valor) {
    if (!valor)
        return [];
    try {
        const opciones = JSON.parse(valor);
        return Array.isArray(opciones) ? opciones : [];
    }
    catch {
        return [];
    }
}
function humanizar(clave) {
    const texto = String(clave).replace(/_/g, ' ');
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}
function formatearValor(valor) {
    if (valor === null || valor === undefined || valor === '')
        return '—';
    if (typeof valor === 'boolean')
        return valor ? 'Sí' : 'No';
    if (typeof valor === 'object')
        return JSON.stringify(valor);
    return String(valor);
}
function obtenerCampos({ soloActivos = true } = {}) {
    const filtro = soloActivos ? 'WHERE activo = 1' : '';
    const filas = exports.db
        .prepare(`SELECT * FROM campos_formulario ${filtro} ORDER BY orden, id`)
        .all();
    return filas.map((fila) => ({
        ...fila,
        opciones: deserializarOpciones(fila.opciones),
        requerido: Boolean(fila.requerido),
        activo: Boolean(fila.activo),
    }));
}
function obtenerCamposFormulario() {
    return obtenerCampos().filter((campo) => !exports.CLAVES_RESERVADAS.includes(campo.clave));
}
function construirEtiquetas() {
    return new Map(obtenerCampos({ soloActivos: false }).map((campo) => [campo.clave, campo.etiqueta]));
}
function calcularEdad(fechaNacimiento) {
    const hoy = new Date();
    const nacimiento = new Date(fechaNacimiento);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const mesDiff = hoy.getMonth() - nacimiento.getMonth();
    if (mesDiff < 0 || (mesDiff === 0 && hoy.getDate() < nacimiento.getDate())) {
        edad -= 1;
    }
    return edad;
}
function formatearRegistro(fila, etiquetas) {
    let extras = {};
    try {
        const parseado = JSON.parse(fila.datos_extras);
        if (parseado && typeof parseado === 'object' && !Array.isArray(parseado)) {
            extras = parseado;
        }
    }
    catch {
        extras = {};
    }
    const valores = {};
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
const registroPorId = exports.db.prepare(`
  SELECT * FROM registros_censo
  WHERE id = ?
`);
function obtenerRegistros() {
    const filas = exports.db
        .prepare(`
      SELECT * FROM registros_censo
      ORDER BY id DESC
    `)
        .all();
    const etiquetas = construirEtiquetas();
    return filas.map((fila) => formatearRegistro(fila, etiquetas));
}
function obtenerRegistroPorId(id) {
    const fila = registroPorId.get(id);
    return fila ? formatearRegistro(fila, construirEtiquetas()) : null;
}
function obtenerEstadisticas() {
    const registros = exports.db
        .prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN sincronizado = 0 THEN 1 ELSE 0 END), 0) AS pendientes,
        COALESCE(SUM(CASE WHEN sincronizado = 1 THEN 1 ELSE 0 END), 0) AS sincronizados
      FROM registros_censo
    `)
        .get();
    const campos = exports.db
        .prepare('SELECT COUNT(*) AS total FROM campos_formulario WHERE activo = 1')
        .get();
    return {
        ...registros,
        campos: campos.total,
    };
}
function insertarRegistro({ cedula, nombres, apellidos, fechaRegistro, extras }) {
    const resultado = exports.db
        .prepare(`
      INSERT INTO registros_censo
        (cedula, nombres, apellidos, fecha_nacimiento, datos_extras)
      VALUES
        (?, ?, ?, COALESCE(?, datetime('now', 'localtime')), ?)
    `)
        .run(cedula, nombres, apellidos, fechaRegistro || null, JSON.stringify(extras));
    return resultado.lastInsertRowid;
}
function actualizarRegistro({ id, cedula, nombres, apellidos, fechaRegistro, extras, }) {
    const resultado = exports.db
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
        .run(cedula, nombres, apellidos, fechaRegistro || null, JSON.stringify(extras), id);
    return resultado.changes > 0;
}
function generarClaveCampo(etiqueta) {
    const base = String(etiqueta)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 50);
    return base || 'campo';
}
const existeClaveCampo = exports.db.prepare('SELECT 1 FROM campos_formulario WHERE clave = ?');
const obtenerUltimoOrden = exports.db.prepare('SELECT COALESCE(MAX(orden), 0) AS maximo FROM campos_formulario');
const insertarDefinicionCampo = exports.db.prepare(`
  INSERT INTO campos_formulario
    (clave, etiqueta, tipo, opciones, requerido, ayuda, orden)
  VALUES
    (@clave, @etiqueta, @tipo, @opciones, @requerido, NULL, @orden)
`);
function crearCampo({ etiqueta, tipo, opciones = [], requerido }) {
    const base = generarClaveCampo(etiqueta);
    let clave = base;
    let sufijo = 2;
    while (exports.CLAVES_RESERVADAS.includes(clave) || existeClaveCampo.get(clave)) {
        clave = `${base}_${sufijo}`;
        sufijo += 1;
    }
    const { maximo } = obtenerUltimoOrden.get();
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
const campoPorId = exports.db.prepare('SELECT * FROM campos_formulario WHERE id = ?');
const actualizarDefinicionCampo = exports.db.prepare(`
  UPDATE campos_formulario
  SET etiqueta = @etiqueta,
      tipo = @tipo,
      opciones = @opciones,
      requerido = @requerido
  WHERE id = @id
`);
const alternarEstadoCampo = exports.db.prepare(`
  UPDATE campos_formulario
  SET activo = CASE activo WHEN 1 THEN 0 ELSE 1 END
  WHERE id = ?
`);
const eliminarDefinicionCampo = exports.db.prepare('DELETE FROM campos_formulario WHERE id = ?');
function obtenerCampoPorId(id) {
    const fila = campoPorId.get(id);
    if (!fila)
        return null;
    return {
        ...fila,
        opciones: deserializarOpciones(fila.opciones),
        requerido: Boolean(fila.requerido),
        activo: Boolean(fila.activo),
    };
}
function actualizarCampo({ id, etiqueta, tipo, opciones = [], requerido }) {
    const resultado = actualizarDefinicionCampo.run({
        id,
        etiqueta,
        tipo,
        opciones: opciones.length ? JSON.stringify(opciones) : null,
        requerido: requerido ? 1 : 0,
    });
    return resultado.changes > 0;
}
function cambiarEstadoCampo(id) {
    const campo = obtenerCampoPorId(id);
    if (!campo)
        return null;
    alternarEstadoCampo.run(id);
    return !campo.activo;
}
function eliminarCampo(id) {
    return eliminarDefinicionCampo.run(id).changes > 0;
}
const contarRegistros = exports.db.prepare('SELECT COUNT(*) AS total FROM registros_censo');
const borrarRegistro = exports.db.prepare('DELETE FROM registros_censo WHERE id = ?');
const borrarTodosLosRegistros = exports.db.prepare('DELETE FROM registros_censo');
const moverIdRegistro = exports.db.prepare('UPDATE registros_censo SET id = ? WHERE id = ?');
const listarIdsRegistros = exports.db.prepare('SELECT id FROM registros_censo ORDER BY id');
const maximoIdRegistro = exports.db.prepare('SELECT COALESCE(MAX(id), 0) AS maximo FROM registros_censo');
const actualizarSecuenciaRegistros = exports.db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'registros_censo'");
const insertarSecuenciaRegistros = exports.db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('registros_censo', ?)");
function reiniciarSecuenciaRegistros() {
    const { total } = contarRegistros.get();
    if (actualizarSecuenciaRegistros.run(total).changes === 0) {
        insertarSecuenciaRegistros.run(total);
    }
}
function renumerarRegistros() {
    const filas = listarIdsRegistros.all();
    if (!filas.length) {
        reiniciarSecuenciaRegistros();
        return;
    }
    const { maximo } = maximoIdRegistro.get();
    const desplazamiento = Number(maximo) + 1;
    for (const fila of filas) {
        moverIdRegistro.run(fila.id + desplazamiento, fila.id);
    }
    filas.forEach((fila, indice) => {
        moverIdRegistro.run(indice + 1, fila.id + desplazamiento);
    });
    reiniciarSecuenciaRegistros();
}
const eliminarRegistroTransaccion = exports.db.transaction((id) => {
    if (!borrarRegistro.run(id).changes)
        return false;
    renumerarRegistros();
    return true;
});
const vaciarRegistrosTransaccion = exports.db.transaction(() => {
    const { changes } = borrarTodosLosRegistros.run();
    reiniciarSecuenciaRegistros();
    return changes;
});
function eliminarRegistro(id) {
    return eliminarRegistroTransaccion(id);
}
function vaciarRegistros() {
    return vaciarRegistrosTransaccion();
}
function insertarVivienda({ estado = 'FALCÓN', municipio = 'MIRANDA', parroquia = 'SAN ANTONIO', comunidad, etapa = null, manzana = null, direccion, numero_casa = null, consejo_comunal_id = null, es_anexo = false, numero_anexo = null, vivienda_principal_id = null, sincronizar_neon = true, }) {
    const resultado = exports.db
        .prepare(`
      INSERT INTO viviendas
        (estado, municipio, parroquia, comunidad, etapa, manzana, direccion, numero_casa,
         consejo_comunal_id, es_anexo, numero_anexo, vivienda_principal_id, sincronizar_neon)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
        .run(estado, municipio, parroquia, comunidad, etapa, manzana, direccion, numero_casa, consejo_comunal_id, es_anexo ? 1 : 0, numero_anexo, vivienda_principal_id, sincronizar_neon ? 1 : 0);
    return resultado.lastInsertRowid;
}
function obtenerViviendaPorId(id) {
    const fila = exports.db
        .prepare('SELECT * FROM viviendas WHERE id = ?')
        .get(id);
    return fila ? fila : null;
}
function cambiarSincronizarNeon(id, sincronizar_neon) {
    const resultado = exports.db
        .prepare(`
      UPDATE viviendas
      SET sincronizar_neon = ?
      WHERE id = ?
    `)
        .run(sincronizar_neon ? 1 : 0, id);
    return resultado.changes > 0;
}
function marcarSoloLocalParaSincronizar() {
    const resultado = exports.db
        .prepare(`
      UPDATE viviendas
      SET sincronizar_neon = 1
      WHERE sincronizado = 0 AND sincronizar_neon = 0
    `)
        .run();
    return resultado.changes;
}
// Cola de eliminaciones que no se pudieron propagar a Neon en el momento.
// Se reintentan al pulsar "Subir a Neon".
function encolarEliminacionNeon(cedula) {
    exports.db.prepare(`
    INSERT INTO neon_eliminaciones (cedula)
    VALUES (?)
    ON CONFLICT(cedula) DO NOTHING
  `).run(cedula);
}
function listarEliminacionesNeon() {
    return exports.db
        .prepare('SELECT id, cedula FROM neon_eliminaciones ORDER BY id')
        .all();
}
function eliminarEliminacionNeon(id) {
    return exports.db.prepare('DELETE FROM neon_eliminaciones WHERE id = ?').run(id).changes > 0;
}
function marcarViviendaPendienteSincronizacion(id) {
    return exports.db
        .prepare(`
      UPDATE viviendas
      SET sincronizado = 0,
          sincronizado_en = NULL
      WHERE id = ?
    `)
        .run(id).changes > 0;
}
function marcarViviendaSincronizada(id) {
    return exports.db
        .prepare(`
      UPDATE viviendas
      SET sincronizado = 1,
          sincronizado_en = datetime('now', 'localtime')
      WHERE id = ?
    `)
        .run(id).changes > 0;
}
function obtenerViviendas({ q = '', page = 1, limit = 20, }) {
    const like = `%${q}%`;
    const offset = (page - 1) * limit;
    const filas = exports.db
        .prepare(`
      SELECT * FROM viviendas
      WHERE comunidad LIKE ? OR manzana LIKE ? OR etapa LIKE ? OR direccion LIKE ? OR numero_casa LIKE ?
      ORDER BY fecha_registro DESC
      LIMIT ? OFFSET ?
    `)
        .all(like, like, like, like, like, limit, offset);
    const totalFila = exports.db
        .prepare(`
      SELECT COUNT(*) AS total FROM viviendas
      WHERE comunidad LIKE ? OR manzana LIKE ? OR etapa LIKE ? OR direccion LIKE ? OR numero_casa LIKE ?
    `)
        .get(like, like, like, like, like);
    return {
        viviendas: filas,
        total: totalFila.total,
    };
}
function actualizarVivienda({ id, estado, municipio, parroquia, comunidad, etapa, manzana, direccion, numero_casa, consejo_comunal_id, es_anexo, numero_anexo, vivienda_principal_id, sincronizar_neon, }) {
    const resultado = exports.db
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
        .run(estado, municipio, parroquia, comunidad, etapa, manzana, direccion, numero_casa, consejo_comunal_id, es_anexo === undefined ? null : es_anexo ? 1 : 0, numero_anexo, vivienda_principal_id, sincronizar_neon === undefined ? null : sincronizar_neon ? 1 : 0, id);
    return resultado.changes > 0;
}
const eliminarViviendaTransaccion = exports.db.transaction((id) => {
    exports.db.prepare('DELETE FROM integrantes_grupo_familiar WHERE vivienda_id = ?').run(id);
    exports.db.prepare('DELETE FROM jefes_familia WHERE vivienda_id = ?').run(id);
    return exports.db.prepare('DELETE FROM viviendas WHERE id = ?').run(id).changes > 0;
});
function eliminarVivienda(id) {
    return eliminarViviendaTransaccion(id);
}
function insertarJefeFamilia({ vivienda_id, cedula_tipo, cedula_numero, nombres, apellidos, fecha_nacimiento, sexo, telefono_movil = null, telefono_habitacion = null, telefono_trabajo = null, correo = null, nivel_instruccion, estado_civil, profesion = null, trabaja_actual, clasificacion_ingresos, frecuencia_ingresos = null, ingreso_mensual_bs = null, }) {
    const edad = calcularEdad(fecha_nacimiento);
    const resultado = exports.db
        .prepare(`
      INSERT INTO jefes_familia
        (vivienda_id, cedula_tipo, cedula_numero, nombres, apellidos, fecha_nacimiento, edad, sexo,
         telefono_movil, telefono_habitacion, telefono_trabajo, correo, nivel_instruccion, estado_civil,
         profesion, trabaja_actual, clasificacion_ingresos, frecuencia_ingresos, ingreso_mensual_bs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
        .run(vivienda_id, cedula_tipo, cedula_numero, nombres, apellidos, fecha_nacimiento, edad, sexo, telefono_movil, telefono_habitacion, telefono_trabajo, correo, nivel_instruccion, estado_civil, profesion, trabaja_actual, clasificacion_ingresos, frecuencia_ingresos, ingreso_mensual_bs);
    return resultado.lastInsertRowid;
}
function obtenerJefePorVivienda(viviendaId) {
    const fila = exports.db
        .prepare('SELECT * FROM jefes_familia WHERE vivienda_id = ?')
        .get(viviendaId);
    return fila ? fila : null;
}
function actualizarJefeFamilia({ id, cedula_tipo, cedula_numero, nombres, apellidos, fecha_nacimiento, sexo, telefono_movil, telefono_habitacion, telefono_trabajo, correo, nivel_instruccion, estado_civil, profesion, trabaja_actual, clasificacion_ingresos, frecuencia_ingresos, ingreso_mensual_bs, }) {
    const jefe = obtenerJefePorVivienda(0);
    const fecha = fecha_nacimiento ?? (jefe ? '' : '');
    const edad = fecha_nacimiento ? calcularEdad(fecha_nacimiento) : undefined;
    const resultado = exports.db
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
        .run(cedula_tipo, cedula_tipo, cedula_numero, nombres, apellidos, fecha_nacimiento, edad, sexo, telefono_movil, telefono_habitacion, telefono_trabajo, correo, nivel_instruccion, estado_civil, profesion, trabaja_actual, clasificacion_ingresos, frecuencia_ingresos, ingreso_mensual_bs, id);
    return resultado.changes > 0;
}
function insertarIntegrante({ vivienda_id, numero, apellidos, nombres, cedula_tipo = null, cedula_numero = null, fecha_nacimiento = null, sexo = null, parentesco, nivel_instruccion = null, profesion = null, ingreso_mensual = null, }) {
    const edad = fecha_nacimiento ? calcularEdad(fecha_nacimiento) : null;
    const resultado = exports.db
        .prepare(`
      INSERT INTO integrantes_grupo_familiar
        (vivienda_id, numero, apellidos, nombres, cedula_tipo, cedula_numero,
         fecha_nacimiento, edad, sexo, parentesco, nivel_instruccion, profesion, ingreso_mensual)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
        .run(vivienda_id, numero, apellidos, nombres, cedula_tipo, cedula_numero, fecha_nacimiento, edad, sexo, parentesco, nivel_instruccion, profesion, ingreso_mensual);
    return resultado.lastInsertRowid;
}
function obtenerIntegrantePorId(id) {
    const fila = exports.db
        .prepare('SELECT * FROM integrantes_grupo_familiar WHERE id = ?')
        .get(id);
    return fila ? fila : null;
}
function obtenerIntegrantesPorVivienda(viviendaId) {
    const filas = exports.db
        .prepare('SELECT * FROM integrantes_grupo_familiar WHERE vivienda_id = ? ORDER BY numero')
        .all(viviendaId);
    return filas;
}
function actualizarIntegrante({ id, numero, apellidos, nombres, cedula_tipo, cedula_numero, fecha_nacimiento, sexo, parentesco, nivel_instruccion, profesion, ingreso_mensual, }) {
    const edad = fecha_nacimiento ? calcularEdad(fecha_nacimiento) : undefined;
    const resultado = exports.db
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
        .run(numero, apellidos, nombres, cedula_tipo, cedula_tipo, cedula_numero, fecha_nacimiento, edad, sexo, parentesco, nivel_instruccion, profesion, ingreso_mensual, id);
    return resultado.changes > 0;
}
function eliminarIntegrante(id) {
    const resultado = exports.db
        .prepare('DELETE FROM integrantes_grupo_familiar WHERE id = ?')
        .run(id);
    return resultado.changes > 0;
}
function eliminarJefeFamilia(id) {
    return exports.db.prepare('DELETE FROM jefes_familia WHERE id = ?').run(id).changes > 0;
}
function obtenerExpedienteVivienda(viviendaId) {
    const vivienda = obtenerViviendaPorId(viviendaId);
    if (!vivienda)
        return null;
    const jefe = obtenerJefePorVivienda(viviendaId);
    const integrantes = obtenerIntegrantesPorVivienda(viviendaId);
    return { vivienda, jefe, integrantes };
}
function crearViviendaCompleta({ vivienda, jefe, integrantes, }) {
    return exports.db.transaction(() => {
        const viviendaId = insertarVivienda(vivienda);
        const jefeId = insertarJefeFamilia({ ...jefe, vivienda_id: viviendaId });
        const integrantesIds = [];
        for (const integrante of integrantes) {
            integrantesIds.push(insertarIntegrante({ ...integrante, vivienda_id: viviendaId }));
        }
        return { viviendaId, jefeId, integrantesIds };
    })();
}
// ============================================================================
// CONSEJOS COMUNALES Y BÚSQUEDA DE VIVIENDA PRINCIPAL
// ============================================================================
function listarConsejosComunales({ soloActivos = true } = {}) {
    const filtro = soloActivos ? 'WHERE activo = 1' : '';
    const filas = exports.db
        .prepare(`
      SELECT * FROM consejos_comunales
      ${filtro}
      ORDER BY nombre COLLATE NOCASE
    `)
        .all();
    return filas.map((fila) => ({
        id: fila.id,
        nombre: fila.nombre,
        sector: fila.sector ?? null,
        activo: Boolean(fila.activo),
    }));
}
function obtenerConsejoComunalPorId(id) {
    const fila = exports.db
        .prepare('SELECT * FROM consejos_comunales WHERE id = ?')
        .get(id);
    if (!fila)
        return null;
    return {
        id: fila.id,
        nombre: fila.nombre,
        sector: fila.sector ?? null,
        activo: Boolean(fila.activo),
    };
}
function crearConsejoComunal({ nombre, sector = null, activo = true, }) {
    const resultado = exports.db
        .prepare(`
      INSERT OR IGNORE INTO consejos_comunales (nombre, sector, activo)
      VALUES (?, ?, ?)
    `)
        .run(nombre, sector, activo ? 1 : 0);
    if (resultado.changes === 0) {
        exports.db.prepare(`
      UPDATE consejos_comunales
      SET sector = COALESCE(?, sector), activo = ?
      WHERE nombre = ? COLLATE NOCASE
    `).run(sector, activo ? 1 : 0, nombre);
        const fila = exports.db
            .prepare('SELECT id FROM consejos_comunales WHERE nombre = ? COLLATE NOCASE')
            .get(nombre);
        return fila ? fila.id : 0;
    }
    return Number(resultado.lastInsertRowid);
}
function buscarViviendasPrincipales(q, limite = 15) {
    const like = `%${q.trim()}%`;
    const filas = exports.db
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
        .all(like, like, like, like, like, like, limite);
    return filas.map((fila) => ({
        id: fila.id,
        direccion: fila.direccion,
        numero_casa: fila.numero_casa ?? null,
        comunidad: fila.comunidad,
        etapa: fila.etapa ?? null,
        manzana: fila.manzana ?? null,
        jefe_nombres: fila.jefe_nombres ?? '',
        jefe_apellidos: fila.jefe_apellidos ?? '',
        jefe_cedula: (fila.cedula_tipo === 'V' || fila.cedula_tipo === 'E') && fila.cedula_numero
            ? `${fila.cedula_tipo}-${fila.cedula_numero}`
            : 'Sin cédula',
    }));
}
// ============================================================================
// USUARIOS
// ============================================================================
function formatearUsuario(fila) {
    return {
        id: fila.id,
        usuario: fila.usuario,
        nombre: fila.nombre,
        rol: fila.rol,
        activo: Boolean(fila.activo),
        creado_en: fila.creado_en,
    };
}
function listarUsuarios() {
    const filas = exports.db
        .prepare('SELECT * FROM usuarios ORDER BY rol, usuario')
        .all();
    return filas.map(formatearUsuario);
}
function obtenerUsuarioPorId(id) {
    const fila = exports.db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    return fila ? formatearUsuario(fila) : null;
}
function obtenerUsuarioPorUsuario(usuario) {
    const fila = exports.db
        .prepare('SELECT * FROM usuarios WHERE usuario = ? COLLATE NOCASE')
        .get(usuario);
    if (!fila)
        return null;
    return { ...formatearUsuario(fila), clave_hash: fila.clave_hash };
}
function crearUsuario({ usuario, nombre, clave, rol, }) {
    const resultado = exports.db
        .prepare(`
      INSERT INTO usuarios (usuario, nombre, clave_hash, rol)
      VALUES (?, ?, ?, ?)
    `)
        .run(usuario, nombre, (0, auth_1.hashClave)(clave), rol);
    return resultado.lastInsertRowid;
}
function actualizarUsuario({ id, nombre, rol, activo, clave, }) {
    const actual = exports.db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!actual)
        return false;
    const resultado = exports.db
        .prepare(`
      UPDATE usuarios
      SET nombre = COALESCE(?, nombre),
          rol = COALESCE(?, rol),
          activo = COALESCE(?, activo),
          clave_hash = COALESCE(?, clave_hash)
      WHERE id = ?
    `)
        .run(nombre ?? null, rol ?? null, activo === undefined ? null : activo ? 1 : 0, clave ? (0, auth_1.hashClave)(clave) : null, id);
    return resultado.changes > 0;
}
function eliminarUsuario(id) {
    return exports.db.prepare('DELETE FROM usuarios WHERE id = ?').run(id).changes > 0;
}
function contarAdminsActivos() {
    const { total } = exports.db
        .prepare("SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'admin' AND activo = 1")
        .get();
    return total;
}
// ============================================================================
// TERRITORIOS
// ============================================================================
const TIPOS_TERRITORIO = [
    'estado',
    'municipio',
    'parroquia',
    'comunidad',
    'etapa',
    'manzana',
];
function formatearTerritorio(fila) {
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
function listarTerritorios({ tipo = null, padreId = null, soloActivos = true, } = {}) {
    const where = [];
    const params = [];
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
    const filas = exports.db
        .prepare(`
      SELECT t.*, p.nombre AS padre_nombre
      FROM territorios t
      LEFT JOIN territorios p ON p.id = t.padre_id
      ${condicion}
      ORDER BY t.tipo, t.orden, t.nombre COLLATE NOCASE
    `)
        .all(...params);
    return filas.map(formatearTerritorio);
}
function obtenerTerritorioPorId(id) {
    const fila = exports.db
        .prepare(`
      SELECT t.*, p.nombre AS padre_nombre
      FROM territorios t
      LEFT JOIN territorios p ON p.id = t.padre_id
      WHERE t.id = ?
    `)
        .get(id);
    return fila ? formatearTerritorio(fila) : null;
}
function crearTerritorio({ tipo, nombre, padre_id = null, }) {
    if (!TIPOS_TERRITORIO.includes(tipo)) {
        throw new Error('Tipo de territorio inválido.');
    }
    const resultado = exports.db
        .prepare(`
      INSERT INTO territorios (tipo, nombre, padre_id, orden)
      VALUES (?, ?, ?, (SELECT COALESCE(MAX(orden), 0) + 10 FROM territorios WHERE tipo = ?))
    `)
        .run(tipo, nombre, padre_id, tipo);
    return resultado.lastInsertRowid;
}
function actualizarTerritorio({ id, nombre, padre_id, activo, }) {
    const resultado = exports.db
        .prepare(`
      UPDATE territorios
      SET nombre = COALESCE(?, nombre),
          padre_id = COALESCE(?, padre_id),
          activo = COALESCE(?, activo)
      WHERE id = ?
    `)
        .run(nombre ?? null, padre_id === undefined ? null : padre_id, activo === undefined ? null : activo ? 1 : 0, id);
    return resultado.changes > 0;
}
function eliminarTerritorio(id) {
    return exports.db.prepare('DELETE FROM territorios WHERE id = ?').run(id).changes > 0;
}
// ============================================================================
// CONFIGURACIÓN DE CAMPOS DEL CENSO
// ============================================================================
function listarConfigCampos() {
    const filas = exports.db
        .prepare('SELECT * FROM config_campos_censo ORDER BY seccion, orden, clave')
        .all();
    return filas.map((fila) => ({
        clave: fila.clave,
        etiqueta: fila.etiqueta,
        seccion: fila.seccion,
        visible: Boolean(fila.visible),
        requerido: Boolean(fila.requerido),
        orden: fila.orden,
    }));
}
function obtenerConfigCamposMap() {
    const mapa = {};
    for (const campo of listarConfigCampos()) {
        mapa[campo.clave] = { visible: campo.visible, requerido: campo.requerido };
    }
    return mapa;
}
function actualizarConfigCampo({ clave, visible, requerido, }) {
    const resultado = exports.db
        .prepare(`
      UPDATE config_campos_censo
      SET visible = COALESCE(?, visible),
          requerido = COALESCE(?, requerido)
      WHERE clave = ?
    `)
        .run(visible === undefined ? null : visible ? 1 : 0, requerido === undefined ? null : requerido ? 1 : 0, clave);
    return resultado.changes > 0;
}
// ============================================================================
// VISTA UNIFICADA DE PERSONAS
// ============================================================================
function obtenerPersonas(filtros = {}) {
    const where = [];
    const params = [];
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
    const filas = exports.db
        .prepare(`
      SELECT * FROM vista_personas_individuales
      ${condicion}
      ORDER BY apellidos COLLATE NOCASE, nombres COLLATE NOCASE
    `)
        .all(...params);
    return { personas: filas, total: filas.length };
}
function obtenerPersonaIndividual(tipo, id) {
    if (tipo !== 'jefe' && tipo !== 'integrante')
        return null;
    const fila = exports.db
        .prepare(`
      SELECT * FROM vista_personas_individuales
      WHERE tipo = ? AND persona_id = ?
    `)
        .get(tipo, id);
    return fila ? fila : null;
}
function contarPersonas() {
    const { total } = exports.db
        .prepare('SELECT COUNT(*) AS total FROM vista_personas_individuales')
        .get();
    return total;
}
function contarViviendas() {
    const { total } = exports.db.prepare('SELECT COUNT(*) AS total FROM viviendas').get();
    return total;
}
function obtenerEstadisticasViviendas() {
    const fila = exports.db
        .prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN sincronizado = 0 AND sincronizar_neon = 1 THEN 1 ELSE 0 END), 0) AS pendientes,
        COALESCE(SUM(CASE WHEN sincronizado = 1 THEN 1 ELSE 0 END), 0) AS sincronizados,
        COALESCE(SUM(CASE WHEN sincronizado = 0 AND sincronizar_neon = 0 THEN 1 ELSE 0 END), 0) AS solo_local
      FROM viviendas
    `)
        .get();
    return { ...fila, personas: contarPersonas() };
}
function reiniciarSecuencia(tabla) {
    const resultado = exports.db
        .prepare('UPDATE sqlite_sequence SET seq = 0 WHERE name = ?')
        .run(tabla);
    if (resultado.changes === 0) {
        exports.db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, 0)').run(tabla);
    }
}
// Borra todos los datos del censo conservando usuarios, territorios y configuración.
function vaciarBaseDatos() {
    return exports.db.transaction(() => {
        const personas = exports.db.prepare('SELECT COUNT(*) AS total FROM jefes_familia').get().total +
            exports.db.prepare('SELECT COUNT(*) AS total FROM integrantes_grupo_familiar').get().total;
        const viviendas = exports.db.prepare('SELECT COUNT(*) AS total FROM viviendas').get().total;
        exports.db.prepare('DELETE FROM integrantes_grupo_familiar').run();
        exports.db.prepare('DELETE FROM jefes_familia').run();
        exports.db.prepare('DELETE FROM viviendas').run();
        exports.db.prepare('DELETE FROM registros_censo').run();
        exports.db.prepare('DELETE FROM neon_eliminaciones').run();
        reiniciarSecuencia('integrantes_grupo_familiar');
        reiniciarSecuencia('jefes_familia');
        reiniciarSecuencia('viviendas');
        reiniciarSecuencia('registros_censo');
        return { viviendas, personas };
    })();
}
module.exports = {
    db: exports.db,
    rutaBaseDatos: exports.rutaBaseDatos,
    CLAVES_RESERVADAS: exports.CLAVES_RESERVADAS,
    TIPOS_CAMPO: exports.TIPOS_CAMPO,
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
    obtenerPersonas,
    obtenerPersonaIndividual,
    contarPersonas,
    contarViviendas,
    obtenerEstadisticasViviendas,
    vaciarBaseDatos,
    Vivienda: null,
    JefeFamilia: null,
    IntegranteFamiliar: null,
};
//# sourceMappingURL=db.js.map