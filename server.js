require('dotenv').config({ quiet: true });

const os = require('os');
const path = require('path');
const express = require('express');

const {
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
} = require('./db');

const app = express();
const PUERTO = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const CLAVE_ADMIN = process.env.CLAVE_ADMIN || 'csc200';

const TIPOS_CAMPO_ETIQUETADOS = [
  { valor: 'text', etiqueta: 'Texto corto' },
  { valor: 'textarea', etiqueta: 'Párrafo' },
  { valor: 'number', etiqueta: 'Número' },
  { valor: 'date', etiqueta: 'Fecha' },
  { valor: 'tel', etiqueta: 'Teléfono' },
  { valor: 'email', etiqueta: 'Correo' },
  { valor: 'select', etiqueta: 'Lista de opciones' },
];

const ETIQUETAS_TIPO = Object.fromEntries(
  TIPOS_CAMPO_ETIQUETADOS.map((tipo) => [tipo.valor, tipo.etiqueta])
);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function valorSimple(valor) {
  if (Array.isArray(valor)) valor = valor[0];
  return typeof valor === 'string' ? valor.trim() : '';
}

function normalizarCedula(valor) {
  return valorSimple(valor).toUpperCase().replace(/\s+/g, '');
}

function normalizarNombre(valor) {
  return valorSimple(valor).replace(/\s+/g, ' ');
}

function normalizarFecha(valor) {
  const limpio = valorSimple(valor);
  if (!limpio) return null;

  const patron = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
  const coincidencia = patron.exec(limpio);
  if (!coincidencia) return false;

  const [, anio, mes, dia, hora = '00', minuto = '00', segundo = '00'] = coincidencia;
  const fecha = new Date(Date.UTC(
    Number(anio),
    Number(mes) - 1,
    Number(dia),
    Number(hora),
    Number(minuto),
    Number(segundo)
  ));

  const esValida =
    fecha.getUTCFullYear() === Number(anio) &&
    fecha.getUTCMonth() === Number(mes) - 1 &&
    fecha.getUTCDate() === Number(dia) &&
    fecha.getUTCHours() === Number(hora) &&
    fecha.getUTCMinutes() === Number(minuto) &&
    fecha.getUTCSeconds() === Number(segundo);

  if (!esValida) return false;

  return `${anio}-${mes}-${dia} ${hora}:${minuto}:${segundo}`;
}

function formatearFecha(valor) {
  if (!valor) return '—';
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(valor));
  if (!coincidencia) return String(valor);

  const [, anio, mes, dia, hora, minuto] = coincidencia;
  return hora ? `${dia}/${mes}/${anio} ${hora}:${minuto}` : `${dia}/${mes}/${anio}`;
}

function recolectarExtras(campos, cuerpo) {
  const extras = {};

  for (const campo of campos) {
    const valor = valorSimple(cuerpo[campo.clave]);

    if (!valor) {
      if (campo.requerido) {
        return { error: `El campo "${campo.etiqueta}" es obligatorio.` };
      }
      continue;
    }

    if (campo.tipo === 'number') {
      const numero = Number(valor);
      if (!Number.isFinite(numero)) {
        return { error: `El campo "${campo.etiqueta}" debe contener un valor numérico.` };
      }
      extras[campo.clave] = numero;
      continue;
    }

    if (campo.tipo === 'select' && !campo.opciones.includes(valor)) {
      return { error: `El valor seleccionado en "${campo.etiqueta}" no es válido.` };
    }

    if (valor.length > 4000) {
      return { error: `El campo "${campo.etiqueta}" supera el máximo de 4000 caracteres.` };
    }

    extras[campo.clave] = valor;
  }

  return { extras };
}

function validarDefinicionCampo(valoresCampo) {
  const etiqueta = normalizarNombre(valoresCampo.etiqueta);
  const tipo = valorSimple(valoresCampo.tipo);
  const requerido = ['on', '1', 'true'].includes(valorSimple(valoresCampo.requerido));

  const opciones = valorSimple(valoresCampo.opciones)
    .split(/[\n,]/)
    .map((opcion) => opcion.trim())
    .filter(Boolean);
  const opcionesUnicas = [...new Set(opciones)];

  if (!etiqueta) {
    return { error: 'Escriba el nombre del campo.' };
  }

  if (etiqueta.length > 80) {
    return { error: 'El nombre del campo no puede superar los 80 caracteres.' };
  }

  if (!TIPOS_CAMPO.includes(tipo)) {
    return { error: 'Seleccione un tipo de campo válido.' };
  }

  if (tipo === 'select') {
    if (!opcionesUnicas.length) {
      return { error: 'Agregue al menos una opción para la lista.' };
    }

    if (opcionesUnicas.length > 30) {
      return { error: 'La lista no puede tener más de 30 opciones.' };
    }

    if (opcionesUnicas.some((opcion) => opcion.length > 80)) {
      return { error: 'Cada opción de la lista puede tener máximo 80 caracteres.' };
    }
  }

  return {
    datos: {
      etiqueta,
      tipo,
      opciones: tipo === 'select' ? opcionesUnicas : [],
      requerido,
    },
  };
}

function leerNuevoCampo(req) {
  return typeof req.query.nuevo === 'string' && /^[a-z0-9_]+$/.test(req.query.nuevo)
    ? req.query.nuevo
    : null;
}

function claveAdministracionValida(valor) {
  return valorSimple(valor) === CLAVE_ADMIN;
}

function validarSector(valores) {
  const nombre = normalizarNombre(valores.nombre);
  const ordenTexto = valorSimple(valores.orden);

  if (!nombre) {
    return { error: 'Escriba el nombre del sector.' };
  }

  if (nombre.length > 80) {
    return { error: 'El nombre del sector no puede superar los 80 caracteres.' };
  }

  let orden = null;
  if (ordenTexto) {
    const numero = Number(ordenTexto);

    if (!Number.isInteger(numero) || numero < 0 || numero > 999999) {
      return { error: 'El orden debe ser un número entero entre 0 y 999999.' };
    }

    orden = numero;
  }

  return { datos: { nombre, orden } };
}

function slugArchivo(texto) {
  return (
    String(texto)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sector'
  );
}

function escaparCsv(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";,\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function enviarCsv(res, nombre, registros) {
  const campos = obtenerCamposFormulario();
  const cabecera = [
    'N.º',
    'Cédula',
    'Nombres',
    'Apellidos',
    'Fecha',
    ...campos.map((campo) => campo.etiqueta),
    'Estado',
  ];

  const filas = registros.map((registro) => [
    registro.id,
    registro.cedula,
    registro.nombres,
    registro.apellidos,
    formatearFecha(registro.fecha_nacimiento),
    ...campos.map((campo) => registro.valores[campo.clave] || ''),
    registro.sincronizado ? 'Sincronizado' : 'Pendiente',
  ]);

  const contenido =
    '\uFEFF' +
    [cabecera, ...filas]
      .map((fila) => fila.map(escaparCsv).join(';'))
      .join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="sector-${slugArchivo(nombre)}.csv"`
  );

  return res.send(contenido);
}

function obtenerCamposAdministrables() {
  return obtenerCampos({ soloActivos: false }).filter(
    (campo) => !CLAVES_RESERVADAS.includes(campo.clave)
  );
}

function obtenerCampoAdministrable(id) {
  const numeroId = Number(id);
  if (!Number.isInteger(numeroId) || numeroId <= 0) return null;

  const campo = obtenerCampoPorId(numeroId);
  if (!campo || CLAVES_RESERVADAS.includes(campo.clave)) return null;

  return campo;
}

function obtenerSectorAdministrable(id) {
  const numeroId = Number(id);
  if (!Number.isInteger(numeroId) || numeroId <= 0) return null;

  return obtenerSectorPorId(numeroId);
}

function renderizar(
  res,
  {
    status = 200,
    error = null,
    ok = null,
    valores = {},
    errorCampo = null,
    abrirCampo = false,
    valoresCampo = {},
    nuevoCampo = null,
  } = {}
) {
  return res.status(status).render('index', {
    campos: obtenerCamposFormulario(),
    sectores: obtenerSectores({ soloActivos: true }),
    registros: obtenerRegistros(),
    stats: obtenerEstadisticas(),
    error,
    ok,
    valores,
    errorCampo,
    abrirCampo,
    valoresCampo,
    nuevoCampo,
    formatoFecha: formatearFecha,
  });
}

function sectoresParaEdicion(registro) {
  const sectores = obtenerSectores({ soloActivos: true });

  if (
    registro.sector_id &&
    !sectores.some((sector) => sector.id === registro.sector_id)
  ) {
    const actual = obtenerSectorPorId(registro.sector_id);
    if (actual) {
      sectores.push(actual);
    }
  }

  return sectores.sort(
    (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)
  );
}

function renderizarEdicion(
  res,
  { status = 200, error = null, registro, valores = null } = {}
) {
  const valoresFormulario = valores || {
    cedula: registro.cedula,
    nombres: registro.nombres,
    apellidos: registro.apellidos,
    fecha_nacimiento: registro.fecha_nacimiento
      ? registro.fecha_nacimiento.replace(' ', 'T')
      : '',
    sector_id: registro.sector_id,
    ...registro.valores,
  };

  return res.status(status).render('editar', {
    registro,
    campos: obtenerCamposFormulario(),
    sectores: sectoresParaEdicion(registro),
    valores: valoresFormulario,
    error,
    formatoFecha: formatearFecha,
  });
}

function renderizarCampos(
  res,
  {
    status = 200,
    ok = null,
    error = null,
    valoresCampo = {},
    errorEdicion = null,
    abrirEdicion = false,
    edicionId = null,
    valoresEdicion = {},
    nuevoCampo = null,
  } = {}
) {
  const campos = obtenerCamposAdministrables();

  return res.status(status).render('campos', {
    campos,
    stats: {
      total: campos.length,
      activos: campos.filter((campo) => campo.activo).length,
      ocultos: campos.filter((campo) => !campo.activo).length,
    },
    tiposCampo: TIPOS_CAMPO_ETIQUETADOS,
    etiquetaTipo: (tipo) => ETIQUETAS_TIPO[tipo] || tipo,
    ok,
    error,
    valoresCampo,
    errorEdicion,
    abrirEdicion,
    edicionId,
    valoresEdicion,
    nuevoCampo,
  });
}

function renderizarSectores(res, { status = 200, ok = null, error = null } = {}) {
  const campos = obtenerCamposFormulario();
  const { secciones, sinSector } = obtenerRegistrosPorSector();
  const totalRegistros =
    secciones.reduce((total, sector) => total + sector.registros.length, 0) +
    sinSector.length;

  return res.status(status).render('sectores', {
    secciones,
    sinSector,
    campos,
    totalRegistros,
    ok,
    error,
    formatoFecha: formatearFecha,
  });
}

function renderizarAdminSectores(
  res,
  {
    status = 200,
    ok = null,
    error = null,
    valoresSector = {},
    errorEdicion = null,
    abrirEdicion = false,
    edicionId = null,
    valoresEdicion = {},
  } = {}
) {
  const sectores = obtenerSectores();

  return res.status(status).render('sectores-admin', {
    sectores,
    stats: {
      total: sectores.length,
      activos: sectores.filter((sector) => sector.activo).length,
      ocultos: sectores.filter((sector) => !sector.activo).length,
      registros: sectores.reduce((total, sector) => total + sector.registros, 0),
    },
    ok,
    error,
    valoresSector,
    errorEdicion,
    abrirEdicion,
    edicionId,
    valoresEdicion,
  });
}

app.get('/', (req, res) => {
  const ok = typeof req.query.ok === 'string' ? req.query.ok.slice(0, 200) : null;
  return renderizar(res, { ok, nuevoCampo: leerNuevoCampo(req) });
});

app.get('/campos', (req, res) => {
  const ok = typeof req.query.ok === 'string' ? req.query.ok.slice(0, 200) : null;
  return renderizarCampos(res, { ok, nuevoCampo: leerNuevoCampo(req) });
});

function validarRegistro(valores, { sectorPermitidoId = null } = {}) {
  const cedula = normalizarCedula(valores.cedula);
  const nombres = normalizarNombre(valores.nombres);
  const apellidos = normalizarNombre(valores.apellidos);

  if (!cedula) {
    return { error: 'La cédula es obligatoria.' };
  }

  if (cedula.length > 30) {
    return { error: 'La cédula no puede superar los 30 caracteres.' };
  }

  if (!nombres || !apellidos) {
    return { error: 'Los nombres y apellidos son obligatorios.' };
  }

  if (nombres.length > 120 || apellidos.length > 120) {
    return { error: 'Los nombres y apellidos no pueden superar los 120 caracteres.' };
  }

  const fechaRegistro = normalizarFecha(valores.fecha_nacimiento);
  if (fechaRegistro === false) {
    return { error: 'La fecha de nacimiento no es válida.' };
  }

  const sectorId = Number(valorSimple(valores.sector_id));

  if (!Number.isInteger(sectorId) || sectorId <= 0) {
    return { error: 'Seleccione el sector al que pertenece el registro.' };
  }

  const sector = obtenerSectorPorId(sectorId);

  if (!sector || (!sector.activo && sector.id !== sectorPermitidoId)) {
    return { error: 'El sector seleccionado no está disponible.' };
  }

  const { extras, error: errorExtras } = recolectarExtras(
    obtenerCamposFormulario(),
    valores
  );

  if (errorExtras) {
    return { error: errorExtras };
  }

  return {
    datos: {
      cedula,
      nombres,
      apellidos,
      fechaRegistro,
      extras,
      sectorId,
    },
  };
}

app.post('/agregar', (req, res, next) => {
  try {
    const valores = req.body;
    const validacion = validarRegistro(valores);

    if (validacion.error) {
      return renderizar(res, { status: 400, error: validacion.error, valores });
    }

    const { datos } = validacion;

    try {
      insertarRegistro(datos);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return renderizar(res, {
          status: 409,
          error: `La cédula ${datos.cedula} ya está registrada en la base local.`,
          valores,
        });
      }
      throw error;
    }

    return res.redirect(
      303,
      `/?ok=${encodeURIComponent('Registro guardado correctamente en la base local.')}#registros`
    );
  } catch (error) {
    return next(error);
  }
});

function obtenerRegistroEditable(param) {
  const id = Number(param);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return obtenerRegistroPorId(id);
}

app.get('/registros/:id/editar', (req, res, next) => {
  try {
    const registro = obtenerRegistroEditable(req.params.id);

    if (!registro) {
      return renderizar(res, {
        status: 404,
        error: 'El registro que intenta editar no existe.',
      });
    }

    return renderizarEdicion(res, { registro });
  } catch (error) {
    return next(error);
  }
});

app.post('/registros/:id/editar', (req, res, next) => {
  try {
    const registro = obtenerRegistroEditable(req.params.id);

    if (!registro) {
      return renderizar(res, {
        status: 404,
        error: 'El registro que intenta editar no existe.',
      });
    }

    const valores = req.body;
    const validacion = validarRegistro(valores, {
      sectorPermitidoId: registro.sector_id,
    });

    if (validacion.error) {
      return renderizarEdicion(res, {
        status: 400,
        error: validacion.error,
        registro,
        valores,
      });
    }

    const { datos } = validacion;

    let extrasAnteriores = {};
    try {
      const parseado = JSON.parse(registro.datos_extras);
      if (parseado && typeof parseado === 'object' && !Array.isArray(parseado)) {
        extrasAnteriores = parseado;
      }
    } catch {
      extrasAnteriores = {};
    }

    const extrasFinales = { ...extrasAnteriores };
    for (const campo of obtenerCamposFormulario()) {
      if (Object.prototype.hasOwnProperty.call(datos.extras, campo.clave)) {
        extrasFinales[campo.clave] = datos.extras[campo.clave];
      } else {
        delete extrasFinales[campo.clave];
      }
    }

    try {
      actualizarRegistro({ id: registro.id, ...datos, extras: extrasFinales });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return renderizarEdicion(res, {
          status: 409,
          error: `La cédula ${datos.cedula} ya está registrada en otro registro.`,
          registro,
          valores,
        });
      }
      throw error;
    }

    return res.redirect(
      303,
      `/?ok=${encodeURIComponent('Registro actualizado correctamente.')}#registro-${registro.id}`
    );
  } catch (error) {
    return next(error);
  }
});

app.post('/registros/:id/eliminar', (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return renderizar(res, {
        status: 404,
        error: 'El registro que intenta eliminar no existe.',
      });
    }

    if (!claveAdministracionValida(req.body.clave)) {
      return renderizar(res, {
        status: 403,
        error: 'Contraseña incorrecta. El registro no se eliminó.',
      });
    }

    if (!eliminarRegistro(id)) {
      return renderizar(res, {
        status: 404,
        error: 'El registro ya no existe.',
      });
    }

    return res.redirect(
      303,
      `/?ok=${encodeURIComponent(
        'Registro eliminado. Los IDs restantes se renumeraron.'
      )}#registros`
    );
  } catch (error) {
    return next(error);
  }
});

app.post('/registros/vaciar', (req, res, next) => {
  try {
    if (!claveAdministracionValida(req.body.clave)) {
      return renderizar(res, {
        status: 403,
        error: 'Contraseña incorrecta. No se eliminó ningún registro.',
      });
    }

    const eliminados = vaciarRegistros();

    const mensaje = eliminados
      ? `Se eliminaron ${eliminados} registro${eliminados === 1 ? '' : 's'}. La numeración volverá a empezar en 1.`
      : 'La base de datos ya estaba vacía.';

    return res.redirect(303, `/?ok=${encodeURIComponent(mensaje)}#registros`);
  } catch (error) {
    return next(error);
  }
});

app.get('/sectores', (req, res) => {
  const ok = typeof req.query.ok === 'string' ? req.query.ok.slice(0, 200) : null;
  return renderizarSectores(res, { ok });
});

app.get('/sectores/administrar', (req, res) => {
  const ok = typeof req.query.ok === 'string' ? req.query.ok.slice(0, 200) : null;
  return renderizarAdminSectores(res, { ok });
});

app.post('/sectores', (req, res, next) => {
  try {
    const validacion = validarSector(req.body);

    if (validacion.error) {
      return renderizarAdminSectores(res, {
        status: 400,
        error: validacion.error,
        valoresSector: req.body,
      });
    }

    try {
      crearSector(validacion.datos);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return renderizarAdminSectores(res, {
          status: 409,
          error: 'Ya existe un sector con ese nombre.',
          valoresSector: req.body,
        });
      }
      throw error;
    }

    return res.redirect(
      303,
      `/sectores/administrar?ok=${encodeURIComponent(
        `Sector "${validacion.datos.nombre}" creado.`
      )}#sectores`
    );
  } catch (error) {
    return next(error);
  }
});

app.post('/sectores/:id/editar', (req, res, next) => {
  try {
    const sector = obtenerSectorAdministrable(req.params.id);

    if (!sector) {
      return renderizarAdminSectores(res, {
        status: 404,
        error: 'El sector que intenta editar no existe.',
      });
    }

    const validacion = validarSector(req.body);

    if (validacion.error) {
      return renderizarAdminSectores(res, {
        status: 400,
        errorEdicion: validacion.error,
        abrirEdicion: true,
        edicionId: sector.id,
        valoresEdicion: req.body,
      });
    }

    const orden =
      validacion.datos.orden === null ? sector.orden : validacion.datos.orden;

    try {
      actualizarSector({
        id: sector.id,
        nombre: validacion.datos.nombre,
        orden,
      });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return renderizarAdminSectores(res, {
          status: 409,
          errorEdicion: 'Ya existe un sector con ese nombre.',
          abrirEdicion: true,
          edicionId: sector.id,
          valoresEdicion: req.body,
        });
      }
      throw error;
    }

    return res.redirect(
      303,
      `/sectores/administrar?ok=${encodeURIComponent(
        `Sector "${validacion.datos.nombre}" actualizado.`
      )}#sector-admin-${sector.id}`
    );
  } catch (error) {
    return next(error);
  }
});

app.post('/sectores/:id/estado', (req, res, next) => {
  try {
    const sector = obtenerSectorAdministrable(req.params.id);

    if (!sector) {
      return renderizarAdminSectores(res, {
        status: 404,
        error: 'El sector que intenta modificar no existe.',
      });
    }

    const activo = cambiarEstadoSector(sector.id);
    const mensaje = activo
      ? `Sector "${sector.nombre}" visible nuevamente.`
      : `Sector "${sector.nombre}" oculto. Sus registros se conservan.`;

    return res.redirect(
      303,
      `/sectores/administrar?ok=${encodeURIComponent(mensaje)}#sector-admin-${sector.id}`
    );
  } catch (error) {
    return next(error);
  }
});

app.post('/sectores/:id/eliminar', (req, res, next) => {
  try {
    const sector = obtenerSectorAdministrable(req.params.id);

    if (!sector) {
      return renderizarAdminSectores(res, {
        status: 404,
        error: 'El sector que intenta eliminar no existe.',
      });
    }

    const resultado = eliminarSector(sector.id);

    if (!resultado.eliminado && resultado.motivo === 'con-registros') {
      return renderizarAdminSectores(res, {
        status: 409,
        error: `No se puede eliminar "${sector.nombre}" porque tiene ${resultado.registros} registro(s). Ocúltelo para dejar de usarlo.`,
      });
    }

    return res.redirect(
      303,
      `/sectores/administrar?ok=${encodeURIComponent(
        `Sector "${sector.nombre}" eliminado.`
      )}#sectores`
    );
  } catch (error) {
    return next(error);
  }
});

app.get('/sectores/sin-sector/exportar.csv', (req, res, next) => {
  try {
    const registros = obtenerRegistros().filter((registro) => !registro.sector_id);
    return enviarCsv(res, 'Sin sector', registros);
  } catch (error) {
    return next(error);
  }
});

app.get('/sectores/:id/exportar.csv', (req, res, next) => {
  try {
    const sector = obtenerSectorAdministrable(req.params.id);

    if (!sector) {
      return res.status(404).type('text/plain').send('Sector no encontrado.');
    }

    const registros = obtenerRegistros().filter(
      (registro) => registro.sector_id === sector.id
    );

    return enviarCsv(res, sector.nombre, registros);
  } catch (error) {
    return next(error);
  }
});

app.post('/campos', (req, res, next) => {
  try {
    const valoresCampo = req.body;
    const desdeAdministracion = valorSimple(valoresCampo.origen) === 'campos';
    const validacion = validarDefinicionCampo(valoresCampo);

    if (validacion.error) {
      if (desdeAdministracion) {
        return renderizarCampos(res, {
          status: 400,
          error: validacion.error,
          valoresCampo,
        });
      }

      return renderizar(res, {
        status: 400,
        errorCampo: validacion.error,
        abrirCampo: true,
        valoresCampo,
      });
    }

    const { datos } = validacion;
    const clave = crearCampo(datos);

    if (desdeAdministracion) {
      return res.redirect(
        303,
        `/campos?ok=${encodeURIComponent(
          `Campo "${datos.etiqueta}" agregado.`
        )}&nuevo=${encodeURIComponent(clave)}#campo-admin-${clave}`
      );
    }

    return res.redirect(
      303,
      `/?ok=${encodeURIComponent(
        `Campo "${datos.etiqueta}" agregado al formulario.`
      )}&nuevo=${encodeURIComponent(clave)}#campo-${clave}`
    );
  } catch (error) {
    return next(error);
  }
});

app.post('/campos/:id/editar', (req, res, next) => {
  try {
    const campo = obtenerCampoAdministrable(req.params.id);

    if (!campo) {
      return renderizarCampos(res, {
        status: 404,
        error: 'El campo que intenta editar no existe.',
      });
    }

    const validacion = validarDefinicionCampo(req.body);

    if (validacion.error) {
      return renderizarCampos(res, {
        status: 400,
        errorEdicion: validacion.error,
        abrirEdicion: true,
        edicionId: campo.id,
        valoresEdicion: req.body,
      });
    }

    actualizarCampo({ id: campo.id, ...validacion.datos });

    return res.redirect(
      303,
      `/campos?ok=${encodeURIComponent(
        `Campo "${validacion.datos.etiqueta}" actualizado.`
      )}&nuevo=${encodeURIComponent(campo.clave)}#campo-admin-${campo.clave}`
    );
  } catch (error) {
    return next(error);
  }
});

app.post('/campos/:id/estado', (req, res, next) => {
  try {
    const campo = obtenerCampoAdministrable(req.params.id);

    if (!campo) {
      return renderizarCampos(res, {
        status: 404,
        error: 'El campo que intenta modificar no existe.',
      });
    }

    const activo = cambiarEstadoCampo(campo.id);
    const mensaje = activo
      ? `Campo "${campo.etiqueta}" visible nuevamente.`
      : `Campo "${campo.etiqueta}" oculto del formulario.`;

    return res.redirect(
      303,
      `/campos?ok=${encodeURIComponent(mensaje)}&nuevo=${encodeURIComponent(
        campo.clave
      )}#campo-admin-${campo.clave}`
    );
  } catch (error) {
    return next(error);
  }
});

app.post('/campos/:id/eliminar', (req, res, next) => {
  try {
    const campo = obtenerCampoAdministrable(req.params.id);

    if (!campo) {
      return renderizarCampos(res, {
        status: 404,
        error: 'El campo que intenta eliminar no existe.',
      });
    }

    eliminarCampo(campo.id);

    return res.redirect(
      303,
      `/campos?ok=${encodeURIComponent(
        `Campo "${campo.etiqueta}" eliminado. Los datos ya registrados se conservan.`
      )}#campos`
    );
  } catch (error) {
    return next(error);
  }
});

app.use((req, res) => {
  res.status(404).type('text/plain').send('Ruta no encontrada.');
});

app.use((error, req, res, next) => {
  console.error('[error]', error);

  if (res.headersSent) return next(error);

  try {
    if (req.path.endsWith('.csv')) {
      return res
        .status(500)
        .type('text/plain')
        .send('No se pudo generar el archivo CSV.');
    }

    if (req.path.startsWith('/campos')) {
      return renderizarCampos(res, {
        status: 500,
        error: 'Ocurrió un error interno al procesar la solicitud.',
      });
    }

    if (req.path.startsWith('/sectores/administrar')) {
      return renderizarAdminSectores(res, {
        status: 500,
        error: 'Ocurrió un error interno al procesar la solicitud.',
      });
    }

    if (req.path.startsWith('/sectores')) {
      return renderizarSectores(res, {
        status: 500,
        error: 'Ocurrió un error interno al procesar la solicitud.',
      });
    }

    return renderizar(res, {
      status: 500,
      error: 'Ocurrió un error interno al procesar la solicitud.',
    });
  } catch {
    return res.status(500).type('text/plain').send('Error interno del servidor.');
  }
});

function direccionesDeRed() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((conexion) => conexion && conexion.family === 'IPv4' && !conexion.internal)
    .map((conexion) => conexion.address);
}

if (require.main === module) {
  app.listen(PUERTO, HOST, () => {
    console.log('');
    console.log('  Comuna Socialista Carabobo 200 - Censo local');
    console.log(`  Servidor:    http://localhost:${PUERTO}`);
    console.log(`  Base local:  ${rutaBaseDatos}`);

    if (HOST === '0.0.0.0') {
      for (const direccion of direccionesDeRed()) {
        console.log(`  Red local:   http://${direccion}:${PUERTO}`);
      }
    }

    console.log('');
    console.log('  Presione Ctrl+C para detener el servidor.');
    console.log('');
  });
}

module.exports = app;
