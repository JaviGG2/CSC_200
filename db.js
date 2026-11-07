require('dotenv').config({ quiet: true });

const path = require('path');
const Database = require('better-sqlite3');

const rutaBaseDatos = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'comuna_carabobo200.db');

const db = new Database(rutaBaseDatos);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS registros_censo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cedula TEXT NOT NULL UNIQUE,
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    fecha_nacimiento TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    datos_extras TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(datos_extras)),
    sector_id INTEGER,
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

  CREATE TABLE IF NOT EXISTS sectores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT COLLATE NOCASE NOT NULL UNIQUE,
    orden INTEGER NOT NULL DEFAULT 100,
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

function asegurarColumnaSector() {
  const columnas = db.prepare('PRAGMA table_info(registros_censo)').all();
  const nombres = columnas.map((columna) => columna.name);

  if (nombres.includes('fecha_registro') && !nombres.includes('fecha_nacimiento')) {
    db.exec('ALTER TABLE registros_censo RENAME COLUMN fecha_registro TO fecha_nacimiento');
  }

  if (!nombres.includes('sector_id')) {
    db.exec('ALTER TABLE registros_censo ADD COLUMN sector_id INTEGER');
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_registros_sector
      ON registros_censo (sector_id, id)
  `);
}

asegurarColumnaSector();

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

const CLAVES_RESERVADAS = [
  'id',
  'cedula',
  'nombres',
  'apellidos',
  'fecha_nacimiento',
  'datos_extras',
  'sincronizado',
  'sincronizado_en',
];

const TIPOS_CAMPO = ['text', 'number', 'date', 'tel', 'email', 'textarea', 'select'];

const insertarCampoInicial = db.prepare(`
  INSERT OR IGNORE INTO campos_formulario
    (clave, etiqueta, tipo, opciones, requerido, ayuda, orden)
  VALUES
    (@clave, @etiqueta, @tipo, @opciones, @requerido, @ayuda, @orden)
`);

const sembrarCampos = db.transaction((campos) => {
  for (const campo of campos) {
    insertarCampoInicial.run({
      ...campo,
      opciones: campo.opciones ? JSON.stringify(campo.opciones) : null,
    });
  }
});

sembrarCampos(CAMPOS_INICIALES);

const migrarSectorDinamico = db.transaction(() => {
  db.prepare("DELETE FROM campos_formulario WHERE clave = 'sector'").run();

  const valores = db
    .prepare(`
      SELECT DISTINCT TRIM(json_extract(datos_extras, '$.sector')) AS nombre
      FROM registros_censo
      WHERE json_extract(datos_extras, '$.sector') IS NOT NULL
        AND TRIM(json_extract(datos_extras, '$.sector')) <> ''
      ORDER BY 1
    `)
    .all();

  if (valores.length) {
    const insertarSectorMigrado = db.prepare(
      'INSERT OR IGNORE INTO sectores (nombre, orden) VALUES (?, ?)'
    );
    const { maximo } = db
      .prepare('SELECT COALESCE(MAX(orden), 0) AS maximo FROM sectores')
      .get();
    let orden = Number(maximo) + 10;

    for (const { nombre } of valores) {
      insertarSectorMigrado.run(nombre, orden);
      orden += 10;
    }

    db.prepare(`
      UPDATE registros_censo
      SET sector_id = (
        SELECT s.id
        FROM sectores s
        WHERE s.nombre = TRIM(json_extract(registros_censo.datos_extras, '$.sector'))
      )
      WHERE sector_id IS NULL
        AND json_extract(datos_extras, '$.sector') IS NOT NULL
        AND TRIM(json_extract(datos_extras, '$.sector')) <> ''
    `).run();
  }

  db.prepare(`
    UPDATE registros_censo
    SET datos_extras = json_remove(datos_extras, '$.sector')
    WHERE json_extract(datos_extras, '$.sector') IS NOT NULL
  `).run();
});

migrarSectorDinamico();

function deserializarOpciones(valor) {
  if (!valor) return [];
  try {
    const opciones = JSON.parse(valor);
    return Array.isArray(opciones) ? opciones : [];
  } catch {
    return [];
  }
}

function humanizar(clave) {
  const texto = String(clave).replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatearValor(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

function obtenerCampos({ soloActivos = true } = {}) {
  const filtro = soloActivos ? 'WHERE activo = 1' : '';
  const filas = db
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
  return obtenerCampos().filter((campo) => !CLAVES_RESERVADAS.includes(campo.clave));
}

function construirEtiquetas() {
  return new Map(
    obtenerCampos({ soloActivos: false }).map((campo) => [campo.clave, campo.etiqueta])
  );
}

function formatearRegistro(fila, etiquetas) {
  let extras = {};
  try {
    const parseado = JSON.parse(fila.datos_extras);
    if (parseado && typeof parseado === 'object' && !Array.isArray(parseado)) {
      extras = parseado;
    }
  } catch {
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

const registroPorId = db.prepare(`
  SELECT r.*, s.nombre AS sector_nombre
  FROM registros_censo r
  LEFT JOIN sectores s ON s.id = r.sector_id
  WHERE r.id = ?
`);

function obtenerRegistros() {
  const filas = db
    .prepare(`
      SELECT r.*, s.nombre AS sector_nombre
      FROM registros_censo r
      LEFT JOIN sectores s ON s.id = r.sector_id
      ORDER BY r.id DESC
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
  const registros = db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN sincronizado = 0 THEN 1 ELSE 0 END), 0) AS pendientes,
        COALESCE(SUM(CASE WHEN sincronizado = 1 THEN 1 ELSE 0 END), 0) AS sincronizados
      FROM registros_censo
    `)
    .get();

  const campos = db
    .prepare('SELECT COUNT(*) AS total FROM campos_formulario WHERE activo = 1')
    .get();

  return {
    ...registros,
    campos: campos.total,
  };
}

function insertarRegistro({ cedula, nombres, apellidos, fechaRegistro, extras, sectorId = null }) {
  const resultado = db
    .prepare(`
      INSERT INTO registros_censo
        (cedula, nombres, apellidos, fecha_nacimiento, datos_extras, sector_id)
      VALUES
        (?, ?, ?, COALESCE(?, datetime('now', 'localtime')), ?, ?)
    `)
    .run(cedula, nombres, apellidos, fechaRegistro || null, JSON.stringify(extras), sectorId);

  return resultado.lastInsertRowid;
}

function actualizarRegistro({
  id,
  cedula,
  nombres,
  apellidos,
  fechaRegistro,
  extras,
  sectorId = null,
}) {
  const resultado = db
    .prepare(`
      UPDATE registros_censo
      SET cedula = ?,
          nombres = ?,
          apellidos = ?,
          fecha_nacimiento = COALESCE(?, fecha_nacimiento),
          datos_extras = ?,
          sector_id = ?,
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
      sectorId,
      id
    );

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

const crearCampo = db.transaction(({ etiqueta, tipo, opciones = [], requerido }) => {
  const base = generarClaveCampo(etiqueta);
  let clave = base;
  let sufijo = 2;

  while (CLAVES_RESERVADAS.includes(clave) || existeClaveCampo.get(clave)) {
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
});

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

function obtenerCampoPorId(id) {
  const fila = campoPorId.get(id);
  if (!fila) return null;

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
  if (!campo) return null;

  alternarEstadoCampo.run(id);
  return !campo.activo;
}

function eliminarCampo(id) {
  return eliminarDefinicionCampo.run(id).changes > 0;
}

const listarSectores = db.prepare(`
  SELECT s.*, COUNT(r.id) AS registros
  FROM sectores s
  LEFT JOIN registros_censo r ON r.sector_id = s.id
  GROUP BY s.id
  ORDER BY s.orden, s.nombre
`);

const buscarSectorPorId = db.prepare(`
  SELECT s.*, COUNT(r.id) AS registros
  FROM sectores s
  LEFT JOIN registros_censo r ON r.sector_id = s.id
  WHERE s.id = ?
  GROUP BY s.id
`);

const insertarSector = db.prepare('INSERT INTO sectores (nombre, orden) VALUES (?, ?)');

const actualizarSectorStmt = db.prepare(`
  UPDATE sectores
  SET nombre = ?, orden = ?
  WHERE id = ?
`);

const alternarEstadoSector = db.prepare(`
  UPDATE sectores
  SET activo = CASE activo WHEN 1 THEN 0 ELSE 1 END
  WHERE id = ?
`);

const eliminarSectorStmt = db.prepare('DELETE FROM sectores WHERE id = ?');

function deserializarSector(fila) {
  return {
    ...fila,
    activo: Boolean(fila.activo),
    registros: Number(fila.registros),
  };
}

function obtenerSectores({ soloActivos = false } = {}) {
  const sectores = listarSectores.all().map(deserializarSector);
  return soloActivos ? sectores.filter((sector) => sector.activo) : sectores;
}

function obtenerSectorPorId(id) {
  const fila = buscarSectorPorId.get(id);
  return fila ? deserializarSector(fila) : null;
}

function crearSector({ nombre, orden = null }) {
  const { maximo } = db
    .prepare('SELECT COALESCE(MAX(orden), 0) AS maximo FROM sectores')
    .get();
  const ordenFinal =
    orden === null || orden === undefined ? Number(maximo) + 10 : Number(orden);

  const resultado = insertarSector.run(nombre, ordenFinal);
  return { id: Number(resultado.lastInsertRowid) };
}

function actualizarSector({ id, nombre, orden }) {
  return actualizarSectorStmt.run(nombre, Number(orden), id).changes > 0;
}

function cambiarEstadoSector(id) {
  const sector = obtenerSectorPorId(id);
  if (!sector) return null;

  alternarEstadoSector.run(id);
  return !sector.activo;
}

function eliminarSector(id) {
  const sector = obtenerSectorPorId(id);

  if (!sector) {
    return { eliminado: false, motivo: 'no-existe' };
  }

  if (sector.registros > 0) {
    return {
      eliminado: false,
      motivo: 'con-registros',
      registros: sector.registros,
    };
  }

  eliminarSectorStmt.run(id);
  return { eliminado: true };
}

function obtenerRegistrosPorSector() {
  const sectores = obtenerSectores();
  const registros = obtenerRegistros();
  const agrupados = new Map();
  const sinSector = [];

  for (const registro of registros) {
    if (registro.sector_id === null || registro.sector_id === undefined) {
      sinSector.push(registro);
      continue;
    }

    if (!agrupados.has(registro.sector_id)) {
      agrupados.set(registro.sector_id, []);
    }

    agrupados.get(registro.sector_id).push(registro);
  }

  return {
    secciones: sectores.map((sector) => ({
      ...sector,
      registros: agrupados.get(sector.id) || [],
    })),
    sinSector,
  };
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

const maximoIdSector = db.prepare(
  'SELECT COALESCE(MAX(id), 0) AS maximo FROM sectores'
);
const actualizarSecuenciaSectores = db.prepare(
  "UPDATE sqlite_sequence SET seq = ? WHERE name = 'sectores'"
);
const insertarSecuenciaSectores = db.prepare(
  "INSERT INTO sqlite_sequence (name, seq) VALUES ('sectores', ?)"
);

const listarIdsSectores = db.prepare('SELECT id FROM sectores ORDER BY id');
const moverIdSector = db.prepare('UPDATE sectores SET id = ? WHERE id = ?');
const actualizarSectorIdEnRegistros = db.prepare(
  'UPDATE registros_censo SET sector_id = ? WHERE sector_id = ?'
);

function reiniciarSecuenciaSectores() {
  const { maximo } = maximoIdSector.get();

  if (actualizarSecuenciaSectores.run(maximo).changes === 0) {
    insertarSecuenciaSectores.run(maximo);
  }
}

function renumerarSectores() {
  const filas = listarIdsSectores.all();

  if (!filas.length) {
    reiniciarSecuenciaSectores();
    return;
  }

  const { maximo } = maximoIdSector.get();
  const desplazamiento = Number(maximo) + 1;
  const mapeo = new Map();

  for (const fila of filas) {
    const idTemporal = fila.id + desplazamiento;
    moverIdSector.run(idTemporal, fila.id);
    mapeo.set(fila.id, idTemporal);
  }

  let nuevoId = 1;
  for (const fila of filas) {
    const idTemporal = mapeo.get(fila.id);
    moverIdSector.run(nuevoId, idTemporal);
    actualizarSectorIdEnRegistros.run(nuevoId, fila.id);
    nuevoId += 1;
  }

  reiniciarSecuenciaSectores();
}

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

const eliminarRegistroTransaccion = db.transaction((id) => {
  if (!borrarRegistro.run(id).changes) return false;

  renumerarRegistros();
  return true;
});

const vaciarRegistrosTransaccion = db.transaction(() => {
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
  obtenerSectores,
  obtenerSectorPorId,
  crearSector,
  actualizarSector,
  cambiarEstadoSector,
  eliminarSector,
  obtenerRegistrosPorSector,
  reiniciarSecuenciaSectores,
  renumerarSectores,
};
