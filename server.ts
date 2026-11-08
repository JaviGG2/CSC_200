import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import express, { Request, Response, NextFunction } from 'express';

dotenv.config({ quiet: true });

const expressEjs = require('ejs');

const {
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
  insertarJefeFamilia,
  obtenerJefePorVivienda,
  actualizarJefeFamilia,
  insertarIntegrante,
  obtenerIntegrantesPorVivienda,
  actualizarIntegrante,
  eliminarIntegrante,
  obtenerExpedienteVivienda,
  crearViviendaCompleta,
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
} = require('./db');

const {
  hashClave,
  verificarClave,
  firmarSesion,
  verificarToken,
  leerCookie,
  guardarSesion,
  borrarSesion,
  requerirAuth,
  requerirAdmin,
} = require('./auth');

const app = express();
const PUERTO = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const CLAVE_ADMIN = process.env.CLAVE_ADMIN || 'csc200';

app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

// Carga la sesión del usuario a partir de la cookie firmada.
app.use((req: Request, res: Response, next: NextFunction) => {
  const token = leerCookie(req, 'sesion');
  const sesion = token ? verificarToken(token) : null;

  if (sesion) {
    const usuario = obtenerUsuarioPorId(sesion.uid);
    if (usuario && usuario.activo) {
      res.locals.usuario = usuario;
      (req as any).usuario = usuario;
    }
  }

  next();
});

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

function valorSimple(valor: unknown): string {
  if (Array.isArray(valor)) valor = valor[0];
  return typeof valor === 'string' ? valor.trim() : '';
}

function normalizarCedula(valor: unknown): string {
  return valorSimple(valor).toUpperCase().replace(/\s+/g, '');
}

function normalizarNombre(valor: unknown): string {
  return valorSimple(valor).replace(/\s+/g, ' ');
}

function normalizarFecha(valor: unknown): string | false {
  const limpio = valorSimple(valor);
  if (!limpio) return null as unknown as false;

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

function formatearFecha(valor: unknown): string {
  if (!valor) return '—';
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(valor));
  if (!coincidencia) return String(valor);

  const [, anio, mes, dia, hora, minuto] = coincidencia;
  return hora ? `${dia}/${mes}/${anio} ${hora}:${minuto}` : `${dia}/${mes}/${anio}`;
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

function validarFormatoCedula(cedula: string): boolean {
  return /^[VE]-\d{6,8}$/.test(cedula);
}

type ResultadoExtras = { extras: Record<string, unknown> } | { error: string };
type ResultadoValidacion<T = any> = { error: string } | { datos: T };

function tieneErrorExtras(r: ResultadoExtras): r is { error: string } {
  return 'error' in r;
}

function tieneErrorValidacion<T>(r: ResultadoValidacion<T>): r is { error: string } {
  return 'error' in r;
}

function recolectarExtras(campos: any[], cuerpo: any): { extras: Record<string, unknown> } | { error: string } {
  const extras: Record<string, unknown> = {};

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

function validarDefinicionCampo(valoresCampo: any): { error: string } | { datos: any } {
  const etiqueta = normalizarNombre(valoresCampo.etiqueta);
  const tipo = valorSimple(valoresCampo.tipo);
  const requerido = ['on', '1', 'true'].includes(valorSimple(valoresCampo.requerido));

  const opciones = valorSimple(valoresCampo.opciones)
    .split(/[\n,]/)
    .map((opcion: string) => opcion.trim())
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

    if (opcionesUnicas.some((opcion: string) => opcion.length > 80)) {
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

function leerNuevoCampo(req: Request): string | null {
  return typeof req.query.nuevo === 'string' && /^[a-z0-9_]+$/.test(req.query.nuevo)
    ? req.query.nuevo
    : null;
}

function claveAdministracionValida(valor: unknown): boolean {
  return valorSimple(valor) === CLAVE_ADMIN;
}

function slugArchivo(texto: unknown): string {
  return (
    String(texto)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sector'
  );
}

function escaparCsv(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";,\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function enviarCsv(res: Response, nombre: string, registros: any[]) {
  const campos = obtenerCamposFormulario();
  const cabecera = [
    'N.º',
    'Cédula',
    'Nombres',
    'Apellidos',
    'Fecha',
    ...campos.map((campo: any) => campo.etiqueta),
    'Estado',
  ];

  const filas = registros.map((registro: any) => [
    registro.id,
    registro.cedula,
    registro.nombres,
    registro.apellidos,
    formatearFecha(registro.fecha_nacimiento),
    ...campos.map((campo: any) => registro.valores[campo.clave] || ''),
    registro.sincronizado ? 'Sincronizado' : 'Pendiente',
  ]);

  const contenido =
    '\uFEFF' +
    [cabecera, ...filas]
      .map((fila: any[]) => fila.map(escaparCsv).join(';'))
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
    (campo: any) => !CLAVES_RESERVADAS.includes(campo.clave)
  );
}

function obtenerCampoAdministrable(id: unknown) {
  const numeroId = Number(id);
  if (!Number.isInteger(numeroId) || numeroId <= 0) return null;

  const campo = obtenerCampoPorId(numeroId);
  if (!campo || CLAVES_RESERVADAS.includes(campo.clave)) return null;

  return campo;
}

function renderizar(
  res: Response,
  {
    status = 200,
    error = null,
    ok = null,
    valores = {},
    errorCampo = null,
    abrirCampo = false,
    valoresCampo = {},
    nuevoCampo = null,
  }: any = {}
) {
  return res.status(status).render('index', {
    campos: obtenerCamposFormulario(),
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

function renderizarEdicion(
  res: Response,
  { status = 200, error = null, registro, valores = null }: any = {}
) {
  const valoresFormulario = valores || {
    cedula: registro.cedula,
    nombres: registro.nombres,
    apellidos: registro.apellidos,
    fecha_nacimiento: registro.fecha_nacimiento
      ? registro.fecha_nacimiento.replace(' ', 'T')
      : '',
    ...registro.valores,
  };

  return res.status(status).render('editar', {
    registro,
    campos: obtenerCamposFormulario(),
    valores: valoresFormulario,
    error,
    formatoFecha: formatearFecha,
  });
}

function renderizarCampos(
  res: Response,
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
  }: any = {}
) {
  const campos = obtenerCamposAdministrables();

  return res.status(status).render('campos', {
    campos,
    stats: {
      total: campos.length,
      activos: campos.filter((campo: any) => campo.activo).length,
      ocultos: campos.filter((campo: any) => !campo.activo).length,
    },
    tiposCampo: TIPOS_CAMPO_ETIQUETADOS,
    etiquetaTipo: (tipo: string) => ETIQUETAS_TIPO[tipo] || tipo,
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

// ============================================================================
// AUTENTICACIÓN
// ============================================================================

function rutaLocalSegura(valor: unknown): string {
  const texto = typeof valor === 'string' ? valor : '';
  return texto.startsWith('/') && !texto.startsWith('//') ? texto : '/';
}

app.get('/login', (req: Request, res: Response) => {
  const usuarioActual = res.locals.usuario;
  if (usuarioActual) {
    return res.redirect(rutaLocalSegura(req.query.next));
  }

  return res.render('login', {
    error: null,
    usuarioValor: '',
    next: rutaLocalSegura(req.query.next),
  });
});

app.post('/login', (req: Request, res: Response) => {
  try {
    const usuarioValor = valorSimple(req.body.usuario);
    const clave = typeof req.body.clave === 'string' ? req.body.clave : '';
    const destino = rutaLocalSegura(req.body.next);

    const cuenta = usuarioValor ? obtenerUsuarioPorUsuario(usuarioValor) : null;

    if (!cuenta || !cuenta.activo || !verificarClave(clave, cuenta.clave_hash)) {
      return res.status(401).render('login', {
        error: 'Usuario o contraseña incorrectos.',
        usuarioValor,
        next: destino,
      });
    }

    guardarSesion(res, cuenta.id);
    return res.redirect(destino);
  } catch (error) {
    console.error('[login]', error);
    return res.status(500).render('login', {
      error: 'No se pudo iniciar sesión. Intente de nuevo.',
      usuarioValor: '',
      next: '/',
    });
  }
});

app.post('/logout', (req: Request, res: Response) => {
  borrarSesion(res);
  return res.redirect('/login');
});

// A partir de aquí todas las rutas requieren sesión iniciada.
app.use(requerirAuth);

// ============================================================================
// RUTAS WEB (EJS)
// ============================================================================

app.get('/', (req: Request, res: Response) => {
  const ok = typeof req.query.ok === 'string' ? req.query.ok.slice(0, 200) : null;
  return renderizar(res, { ok, nuevoCampo: leerNuevoCampo(req) });
});

app.get('/wizard', (req: Request, res: Response) => {
  const ok = typeof req.query.ok === 'string' ? req.query.ok.slice(0, 200) : null;
  return res.render('wizard', {
    ok,
    error: null,
    formatearFecha,
    territorios: {
      estados: listarTerritorios({ tipo: 'estado' }),
      municipios: listarTerritorios({ tipo: 'municipio' }),
      parroquias: listarTerritorios({ tipo: 'parroquia' }),
      comunidades: listarTerritorios({ tipo: 'comunidad' }),
      etapas: listarTerritorios({ tipo: 'etapa' }),
      manzanas: listarTerritorios({ tipo: 'manzana' }),
    },
    configCampos: obtenerConfigCamposMap(),
  });
});

// ============================================================================
// DIRECTORIO DE PERSONAS Y FICHAS
// ============================================================================

app.get('/personas', (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const sexo = typeof req.query.sexo === 'string' ? req.query.sexo : '';
  const nivel = typeof req.query.nivel === 'string' ? req.query.nivel : '';
  const trabaja = typeof req.query.trabaja === 'string' ? req.query.trabaja : '';
  const parentesco = typeof req.query.parentesco === 'string' ? req.query.parentesco : '';
  const manzana = typeof req.query.manzana === 'string' ? req.query.manzana : '';
  const etapa = typeof req.query.etapa === 'string' ? req.query.etapa : '';
  const comunidad = typeof req.query.comunidad === 'string' ? req.query.comunidad : '';
  const tipo = typeof req.query.tipo === 'string' ? req.query.tipo : '';

  const edadMin = req.query.edad_min !== undefined && req.query.edad_min !== ''
    ? Number(req.query.edad_min)
    : null;
  const edadMax = req.query.edad_max !== undefined && req.query.edad_max !== ''
    ? Number(req.query.edad_max)
    : null;

  const filtros = {
    q,
    sexo,
    nivel,
    trabaja,
    parentesco,
    manzana,
    etapa,
    comunidad,
    tipo,
    edadMin: Number.isFinite(edadMin as number) ? edadMin : null,
    edadMax: Number.isFinite(edadMax as number) ? edadMax : null,
  };

  const { personas, total } = obtenerPersonas(filtros);

  return res.render('personas', {
    personas,
    total,
    filtros,
    opciones: {
      comunidades: listarTerritorios({ tipo: 'comunidad' }),
      etapas: listarTerritorios({ tipo: 'etapa' }),
      manzanas: listarTerritorios({ tipo: 'manzana' }),
    },
  });
});

app.get('/personas/:tipo/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const tipo = req.params.tipo;
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).render('error', {
        codigo: 404,
        mensaje: 'La persona solicitada no existe.',
      });
    }

    const persona = obtenerPersonaIndividual(tipo, id);
    if (!persona) {
      return res.status(404).render('error', {
        codigo: 404,
        mensaje: 'La persona solicitada no existe.',
      });
    }

    const expediente = obtenerExpedienteVivienda(persona.vivienda_id);

    return res.render('persona', {
      persona,
      vivienda: expediente?.vivienda ?? null,
      jefe: expediente?.jefe ?? null,
      integrantes: expediente?.integrantes ?? [],
      formatearFecha,
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/viviendas/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).render('error', {
        codigo: 404,
        mensaje: 'La vivienda solicitada no existe.',
      });
    }

    const expediente = obtenerExpedienteVivienda(id);
    if (!expediente) {
      return res.status(404).render('error', {
        codigo: 404,
        mensaje: 'La vivienda solicitada no existe.',
      });
    }

    return res.render('vivienda', {
      ...expediente,
      formatearFecha,
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/viviendas/:id/editar', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const expediente = Number.isInteger(id) && id > 0 ? obtenerExpedienteVivienda(id) : null;

    if (!expediente) {
      return res.status(404).render('error', {
        codigo: 404,
        mensaje: 'La vivienda solicitada no existe.',
      });
    }

    return res.render('vivienda-editar', {
      ...expediente,
      ok: mensajeQuery(req, 'ok'),
      error: mensajeQuery(req, 'error'),
      territorios: {
        comunidades: listarTerritorios({ tipo: 'comunidad' }),
        etapas: listarTerritorios({ tipo: 'etapa' }),
        manzanas: listarTerritorios({ tipo: 'manzana' }),
      },
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/viviendas/:id/editar', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const expediente = Number.isInteger(id) && id > 0 ? obtenerExpedienteVivienda(id) : null;

    if (!expediente) {
      return res.status(404).render('error', {
        codigo: 404,
        mensaje: 'La vivienda solicitada no existe.',
      });
    }

    const comunidad = normalizarNombre(req.body.comunidad);
    const direccion = normalizarNombre(req.body.direccion);
    if (!comunidad || !direccion) {
      return res.redirect(`/viviendas/${id}/editar?error=` + encodeURIComponent('Comunidad y dirección son obligatorias.'));
    }

    actualizarVivienda({
      id,
      estado: normalizarNombre(req.body.estado) || undefined,
      municipio: normalizarNombre(req.body.municipio) || undefined,
      parroquia: normalizarNombre(req.body.parroquia) || undefined,
      comunidad,
      etapa: normalizarNombre(req.body.etapa) || null,
      manzana: normalizarNombre(req.body.manzana) || null,
      direccion,
      numero_casa: normalizarNombre(req.body.numero_casa) || null,
    });

    if (expediente.jefe) {
      const jefe = expediente.jefe;
      const cedulaNumero = normalizarCedula(req.body.cedula_numero);
      const nombres = normalizarNombre(req.body.nombres);
      const apellidos = normalizarNombre(req.body.apellidos);

      if (cedulaNumero && nombres && apellidos) {
        actualizarJefeFamilia({
          id: jefe.id,
          cedula_tipo: valorSimple(req.body.cedula_tipo) === 'E' ? 'E' : 'V',
          cedula_numero: cedulaNumero,
          nombres,
          apellidos,
          fecha_nacimiento: valorSimple(req.body.fecha_nacimiento) || undefined,
          sexo: valorSimple(req.body.sexo) === 'F' ? 'F' : 'M',
          telefono_movil: normalizarNombre(req.body.telefono_movil) || null,
          telefono_habitacion: normalizarNombre(req.body.telefono_habitacion) || null,
          telefono_trabajo: normalizarNombre(req.body.telefono_trabajo) || null,
          correo: normalizarNombre(req.body.correo) || null,
          nivel_instruccion: normalizarNombre(req.body.nivel_instruccion) || undefined,
          estado_civil: normalizarNombre(req.body.estado_civil) || undefined,
          profesion: normalizarNombre(req.body.profesion) || null,
          trabaja_actual: valorSimple(req.body.trabaja_actual) === 'No' ? 'No' : 'Sí',
          clasificacion_ingresos: normalizarNombre(req.body.clasificacion_ingresos) || undefined,
          frecuencia_ingresos: normalizarNombre(req.body.frecuencia_ingresos) || null,
        });
      }
    }

    return res.redirect(`/viviendas/${id}?ok=` + encodeURIComponent('Vivienda actualizada correctamente.'));
  } catch (error) {
    return next(error);
  }
});

app.get('/campos', requerirAdmin, (req: Request, res: Response) => {
  const ok = typeof req.query.ok === 'string' ? req.query.ok.slice(0, 200) : null;
  return renderizarCampos(res, { ok, nuevoCampo: leerNuevoCampo(req) });
});

app.get('/ubicacion', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { viviendas } = obtenerViviendas({ q: '', page: 1, limit: 10000 });

    const viviendasConJefe = viviendas.map((v: any) => {
      const jefe = obtenerJefePorVivienda(v.id);
      return {
        ...v,
        jefe_nombres: jefe?.nombres ?? '',
        jefe_apellidos: jefe?.apellidos ?? '',
        jefe_cedula: jefe ? `${jefe.cedula_tipo}-${jefe.cedula_numero}` : '',
      };
    });

    const porComunidad = new Map<string, any[]>();
    for (const v of viviendasConJefe) {
      const key = v.comunidad || 'Sin comunidad';
      if (!porComunidad.has(key)) porComunidad.set(key, []);
      porComunidad.get(key)!.push(v);
    }

    const agrupacion = Array.from(porComunidad.entries()).map(([comunidad, viviendasLista]) => {
      const porManzana = new Map<string, any[]>();
      for (const v of viviendasLista) {
        const key = v.manzana || 'Sin manzana';
        if (!porManzana.has(key)) porManzana.set(key, []);
        porManzana.get(key)!.push(v);
      }

      const manzanas = Array.from(porManzana.entries()).map(([manzana, viviendasManzana]) => {
        const porEtapa = new Map<string, any[]>();
        for (const v of viviendasManzana) {
          const key = v.etapa || 'Sin etapa';
          if (!porEtapa.has(key)) porEtapa.set(key, []);
          porEtapa.get(key)!.push(v);
        }

        const etapas = Array.from(porEtapa.entries()).map(([etapa, viviendasEtapa]) => ({
          etapa,
          total: viviendasEtapa.length,
          viviendas: viviendasEtapa.map((v: any) => ({
            id: v.id,
            direccion: v.direccion || '—',
            numero_casa: v.numero_casa || '—',
            jefe_nombres: v.jefe_nombres,
            jefe_apellidos: v.jefe_apellidos,
            jefe_cedula: v.jefe_cedula,
            fecha_registro: v.fecha_registro,
          })),
        }));

        return {
          manzana,
          total: viviendasManzana.length,
          etapas,
        };
      });

      return {
        comunidad,
        total: viviendasLista.length,
        manzanas,
      };
    });

    const ok = typeof req.query.ok === 'string' ? req.query.ok.slice(0, 200) : null;
    return res.render('ubicacion', {
      ok,
      error: null,
      agrupacion,
      stats: obtenerEstadisticas(),
      formatearFecha,
    });
  } catch (error) {
    return next(error);
  }
});

function validarRegistro(valores: any): { error: string } | { datos: any } {
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

  const resultadoExtras = recolectarExtras(
    obtenerCamposFormulario(),
    valores
  );

  if (tieneErrorExtras(resultadoExtras)) {
    return { error: resultadoExtras.error };
  }

  const extras = resultadoExtras.extras;

  return {
    datos: {
      cedula,
      nombres,
      apellidos,
      fechaRegistro,
      extras,
    },
  };
}

app.post('/agregar', (req: Request, res: Response, next: NextFunction) => {
  return res.redirect(303, '/wizard?ok=' + encodeURIComponent('Registro ahora se realiza por Vivienda. Use el asistente de 3 pasos.'));
});

function obtenerRegistroEditable(param: unknown) {
  const id = Number(param);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return obtenerRegistroPorId(id);
}

app.get('/registros/:id/editar', (req: Request, res: Response, next: NextFunction) => {
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

app.post('/registros/:id/editar', (req: Request, res: Response, next: NextFunction) => {
  try {
    const registro = obtenerRegistroEditable(req.params.id);

    if (!registro) {
      return renderizar(res, {
        status: 404,
        error: 'El registro que intenta editar no existe.',
      });
    }

    const valores = req.body;
    const validacion = validarRegistro(valores);

    if (tieneErrorValidacion(validacion)) {
      return renderizarEdicion(res, {
        status: 400,
        error: validacion.error,
        registro,
        valores,
      });
    }

    const { datos } = validacion;

    let extrasAnteriores: Record<string, unknown> = {};
    try {
      const parseado = JSON.parse(registro.datos_extras);
      if (parseado && typeof parseado === 'object' && !Array.isArray(parseado)) {
        extrasAnteriores = parseado;
      }
    } catch {
      extrasAnteriores = {};
    }

    const extrasFinales: Record<string, unknown> = { ...extrasAnteriores };
    for (const campo of obtenerCamposFormulario()) {
      if (Object.prototype.hasOwnProperty.call(datos.extras, campo.clave)) {
        extrasFinales[campo.clave] = datos.extras[campo.clave];
      } else {
        delete extrasFinales[campo.clave];
      }
    }

    try {
      actualizarRegistro({ id: registro.id, ...datos, extras: extrasFinales });
    } catch (error: any) {
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

app.post('/registros/:id/eliminar', (req: Request, res: Response, next: NextFunction) => {
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

app.post('/registros/vaciar', (req: Request, res: Response, next: NextFunction) => {
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

app.post('/campos', requerirAdmin, (req: Request, res: Response, next: NextFunction) => {
  try {
    const valoresCampo = req.body;
    const desdeAdministracion = valorSimple(valoresCampo.origen) === 'campos';
    const validacion = validarDefinicionCampo(valoresCampo);

    if (tieneErrorValidacion(validacion)) {
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

app.post('/campos/:id/editar', requerirAdmin, (req: Request, res: Response, next: NextFunction) => {
  try {
    const campo = obtenerCampoAdministrable(req.params.id);

    if (!campo) {
      return renderizarCampos(res, {
        status: 404,
        error: 'El campo que intenta editar no existe.',
      });
    }

    const validacion = validarDefinicionCampo(req.body);

    if (tieneErrorValidacion(validacion)) {
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

app.post('/campos/:id/estado', requerirAdmin, (req: Request, res: Response, next: NextFunction) => {
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

app.post('/campos/:id/eliminar', requerirAdmin, (req: Request, res: Response, next: NextFunction) => {
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

// ============================================================================
// API REST - VIVIENDAS (Nivel A: Ubicación y Casa)
// ============================================================================

app.post('/api/viviendas', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { vivienda, jefe, integrantes } = req.body;

    if (!vivienda || !jefe) {
      return res.status(400).json({ error: 'Se requieren vivienda y jefe de familia.' });
    }

    const cedulaCompleta = `${jefe.cedula_tipo}-${jefe.cedula_numero}`;
    if (!validarFormatoCedula(cedulaCompleta)) {
      return res.status(400).json({ error: 'Formato de cédula inválido (V-12345678).' });
    }

    const fechaValida = normalizarFecha(jefe.fecha_nacimiento);
    if (fechaValida === false) {
      return res.status(400).json({ error: 'Fecha de nacimiento inválida.' });
    }

    try {
      const resultado = crearViviendaCompleta({
        vivienda: {
          estado: vivienda.estado || 'FALCÓN',
          municipio: vivienda.municipio || 'MIRANDA',
          parroquia: vivienda.parroquia || 'SAN ANTONIO',
          comunidad: vivienda.comunidad,
          etapa: vivienda.etapa ?? null,
          manzana: vivienda.manzana ?? null,
          direccion: vivienda.direccion,
          numero_casa: vivienda.numero_casa ?? null,
          sincronizar_neon: vivienda.sincronizar_neon ?? true,
        },
        jefe: {
          cedula_tipo: jefe.cedula_tipo,
          cedula_numero: jefe.cedula_numero,
          nombres: jefe.nombres,
          apellidos: jefe.apellidos,
          fecha_nacimiento: jefe.fecha_nacimiento,
          sexo: jefe.sexo,
          telefono_movil: jefe.telefono_movil ?? null,
          telefono_habitacion: jefe.telefono_habitacion ?? null,
          telefono_trabajo: jefe.telefono_trabajo ?? null,
          correo: jefe.correo ?? null,
          nivel_instruccion: jefe.nivel_instruccion,
          estado_civil: jefe.estado_civil,
          profesion: jefe.profesion ?? null,
          trabaja_actual: jefe.trabaja_actual,
          clasificacion_ingresos: jefe.clasificacion_ingresos,
          frecuencia_ingresos: jefe.frecuencia_ingresos ?? null,
        },
        integrantes: (integrantes || []).map((integrante: any, index: number) => ({
          numero: index + 1,
          apellidos: integrante.apellidos,
          nombres: integrante.nombres,
          cedula_tipo: integrante.cedula_tipo ?? null,
          cedula_numero: integrante.cedula_numero ?? null,
          fecha_nacimiento: integrante.fecha_nacimiento ?? null,
          sexo: integrante.sexo ?? null,
          parentesco: integrante.parentesco,
          nivel_instruccion: integrante.nivel_instruccion ?? null,
          profesion: integrante.profesion ?? null,
        })),
      });

      return res.status(201).json({
        ok: true,
        viviendaId: resultado.viviendaId,
        jefeId: resultado.jefeId,
        integrantesIds: resultado.integrantesIds,
        mensaje: 'Vivienda registrada correctamente.',
      });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'La cédula del jefe de familia ya está registrada.' });
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
});

app.get('/api/viviendas', (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req.query.q as string) || '';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const { viviendas, total } = obtenerViviendas({ q, page, limit });

    return res.json({
      viviendas,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    return next(error);
  }
});

// ============================================================================
// API - AGRUPACIÓN POR UBICACIÓN (Comunidad / Manzana / Etapa)
// ============================================================================

app.get('/api/viviendas/agrupacion', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { viviendas } = obtenerViviendas({ q: '', page: 1, limit: 10000 });

    // Cargar jefes para cada vivienda
    const viviendasConJefe = viviendas.map((v: any) => {
      const jefe = obtenerJefePorVivienda(v.id);
      return { ...v, jefe_nombres: jefe?.nombres ?? '', jefe_apellidos: jefe?.apellidos ?? '', jefe_cedula: jefe ? `${jefe.cedula_tipo}-${jefe.cedula_numero}` : '' };
    });

    // Agrupar por Comunidad > Manzana > Etapa
    const porComunidad = new Map<string, any[]>();
    for (const v of viviendasConJefe) {
      const key = v.comunidad || 'Sin comunidad';
      if (!porComunidad.has(key)) porComunidad.set(key, []);
      porComunidad.get(key)!.push(v);
    }

    const resultado = Array.from(porComunidad.entries()).map(([comunidad, viviendasLista]) => {
      // Agrupar por Manzana dentro de la comunidad
      const porManzana = new Map<string, any[]>();
      for (const v of viviendasLista) {
        const key = v.manzana || 'Sin manzana';
        if (!porManzana.has(key)) porManzana.set(key, []);
        porManzana.get(key)!.push(v);
      }

      const manzanas = Array.from(porManzana.entries()).map(([manzana, viviendasManzana]) => {
        // Agrupar por Etapa dentro de la manzana
        const porEtapa = new Map<string, any[]>();
        for (const v of viviendasManzana) {
          const key = v.etapa || 'Sin etapa';
          if (!porEtapa.has(key)) porEtapa.set(key, []);
          porEtapa.get(key)!.push(v);
        }

        const etapas = Array.from(porEtapa.entries()).map(([etapa, viviendasEtapa]) => ({
          etapa,
          total: viviendasEtapa.length,
          viviendas: viviendasEtapa.map((v: any) => ({
            id: v.id,
            direccion: v.direccion || '—',
            numero_casa: v.numero_casa || '—',
            jefe_nombres: v.jefe_nombres,
            jefe_apellidos: v.jefe_apellidos,
            jefe_cedula: v.jefe_cedula,
            fecha_registro: v.fecha_registro,
          })),
        }));

        return {
          manzana,
          total: viviendasManzana.length,
          etapas,
        };
      });

      return {
        comunidad,
        total: viviendasLista.length,
        manzanas,
      };
    });

    return res.json({ agrupacion: resultado, total: viviendasConJefe.length });
  } catch (error) {
    return next(error);
  }
});

// ============================================================================
// API - TODAS LAS PERSONAS (plano, sin importar vivienda)
// ============================================================================

app.get('/api/personas', (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req.query.q as string) || '';
    const like = `%${q}%`;

    const personas: any[] = [];

    // Obtener todas las viviendas con sus jefes
    const viviendas = db
      .prepare(`
        SELECT v.id as vivienda_id, v.comunidad, v.etapa, v.manzana, v.direccion, v.numero_casa,
               j.id as jefe_id, j.cedula_tipo as jefe_cedula_tipo, j.cedula_numero as jefe_cedula_numero,
               j.nombres as jefe_nombres, j.apellidos as jefe_apellidos,
               j.fecha_nacimiento as jefe_fecha_nacimiento, j.edad as jefe_edad, j.sexo as jefe_sexo,
               j.telefono_movil as jefe_telefono_movil, j.telefono_habitacion as jefe_telefono_habitacion,
               j.telefono_trabajo as jefe_telefono_trabajo, j.correo as jefe_correo,
               j.nivel_instruccion as jefe_nivel_instruccion, j.estado_civil as jefe_estado_civil,
               j.profesion as jefe_profesion, j.trabaja_actual as jefe_trabaja_actual,
               j.clasificacion_ingresos as jefe_clasificacion_ingresos, j.frecuencia_ingresos as jefe_frecuencia_ingresos
        FROM viviendas v
        LEFT JOIN jefes_familia j ON j.vivienda_id = v.id
        WHERE v.comunidad LIKE ? OR v.manzana LIKE ? OR v.etapa LIKE ? OR v.direccion LIKE ? OR v.numero_casa LIKE ?
           OR j.nombres LIKE ? OR j.apellidos LIKE ? OR j.cedula_numero LIKE ?
        ORDER BY v.id, j.id
      `)
      .all(like, like, like, like, like, like, like, like) as any[];

    // Agregar jefes de familia como personas
    for (const v of viviendas) {
      if (v.jefe_id) {
        personas.push({
          tipo: 'Jefe de Familia',
          vivienda_id: v.vivienda_id,
          comunidad: v.comunidad,
          etapa: v.etapa || '—',
          manzana: v.manzana || '—',
          direccion: v.direccion,
          numero_casa: v.numero_casa || '—',
          cedula_tipo: v.jefe_cedula_tipo || '',
          cedula_numero: v.jefe_cedula_numero || '',
          nombres: v.jefe_nombres,
          apellidos: v.jefe_apellidos,
          fecha_nacimiento: v.jefe_fecha_nacimiento,
          edad: v.jefe_edad,
          sexo: v.jefe_sexo,
          telefono_movil: v.jefe_telefono_movil,
          telefono_habitacion: v.jefe_telefono_habitacion,
          telefono_trabajo: v.jefe_telefono_trabajo,
          correo: v.jefe_correo,
          nivel_instruccion: v.jefe_nivel_instruccion,
          estado_civil: v.jefe_estado_civil,
          profesion: v.jefe_profesion,
          trabaja_actual: v.jefe_trabaja_actual,
          clasificacion_ingresos: v.jefe_clasificacion_ingresos,
          frecuencia_ingresos: v.jefe_frecuencia_ingresos,
          parentesco: 'Jefe de Familia',
        });
      }

      // Obtener integrantes de esta vivienda
      const integrantes = db
        .prepare('SELECT * FROM integrantes_grupo_familiar WHERE vivienda_id = ? ORDER BY numero')
        .all(v.vivienda_id) as any[];

      for (const inc of integrantes) {
        personas.push({
          tipo: 'Integrante',
          vivienda_id: v.vivienda_id,
          comunidad: v.comunidad,
          etapa: v.etapa || '—',
          manzana: v.manzana || '—',
          direccion: v.direccion,
          numero_casa: v.numero_casa || '—',
          cedula_tipo: inc.cedula_tipo || '',
          cedula_numero: inc.cedula_numero || '',
          nombres: inc.nombres,
          apellidos: inc.apellidos,
          fecha_nacimiento: inc.fecha_nacimiento,
          edad: inc.edad,
          sexo: inc.sexo,
          telefono_movil: null,
          telefono_habitacion: null,
          telefono_trabajo: null,
          correo: null,
          nivel_instruccion: inc.nivel_instruccion,
          estado_civil: null,
          profesion: inc.profesion,
          trabaja_actual: null,
          clasificacion_ingresos: null,
          frecuencia_ingresos: null,
          parentesco: inc.parentesco,
        });
      }
    }

    // Filtrar por búsqueda si se proporcionó
    const resultadoFiltrado = q
      ? personas.filter((p) =>
          (p.nombres && p.nombres.toLowerCase().includes(q.toLowerCase())) ||
          (p.apellidos && p.apellidos.toLowerCase().includes(q.toLowerCase())) ||
          (p.cedula_numero && p.cedula_numero.includes(q)) ||
          (p.comunidad && p.comunidad.toLowerCase().includes(q.toLowerCase())) ||
          (p.manzana && p.manzana.toLowerCase().includes(q.toLowerCase())) ||
          (p.etapa && p.etapa.toLowerCase().includes(q.toLowerCase())) ||
          (p.direccion && p.direccion.toLowerCase().includes(q.toLowerCase()))
        )
      : personas;

    return res.json({
      personas: resultadoFiltrado,
      total: resultadoFiltrado.length,
      jefes: personas.filter((p) => p.tipo === 'Jefe de Familia').length,
      integrantes: personas.filter((p) => p.tipo === 'Integrante').length,
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/viviendas/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de vivienda inválido.' });
    }

    const expediente = obtenerExpedienteVivienda(id);
    if (!expediente) {
      return res.status(404).json({ error: 'Vivienda no encontrada.' });
    }

    return res.json(expediente);
  } catch (error) {
    return next(error);
  }
});

app.put('/api/viviendas/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de vivienda inválido.' });
    }

    const { vivienda, jefe, integrantes } = req.body;

    if (vivienda) {
      actualizarVivienda({
        id,
        estado: vivienda.estado,
        municipio: vivienda.municipio,
        parroquia: vivienda.parroquia,
        comunidad: vivienda.comunidad,
        etapa: vivienda.etapa,
        manzana: vivienda.manzana,
        direccion: vivienda.direccion,
        numero_casa: vivienda.numero_casa,
      });
    }

    const expedienteActual = obtenerExpedienteVivienda(id);
    if (jefe && expedienteActual?.jefe) {
      actualizarJefeFamilia({
        id: expedienteActual.jefe.id,
        cedula_tipo: jefe.cedula_tipo,
        cedula_numero: jefe.cedula_numero,
        nombres: jefe.nombres,
        apellidos: jefe.apellidos,
        fecha_nacimiento: jefe.fecha_nacimiento,
        sexo: jefe.sexo,
        telefono_movil: jefe.telefono_movil,
        telefono_habitacion: jefe.telefono_habitacion,
        telefono_trabajo: jefe.telefono_trabajo,
        correo: jefe.correo,
        nivel_instruccion: jefe.nivel_instruccion,
        estado_civil: jefe.estado_civil,
        profesion: jefe.profesion,
        trabaja_actual: jefe.trabaja_actual,
        clasificacion_ingresos: jefe.clasificacion_ingresos,
        frecuencia_ingresos: jefe.frecuencia_ingresos,
      });
    }

    if (Array.isArray(integrantes)) {
      const existentes = obtenerIntegrantesPorVivienda(id);
      const idsExistentes = new Set(existentes.map((e: any) => e.id));
      const idsEnviados = new Set<number>();

      for (const integrante of integrantes) {
        if (integrante.id && idsExistentes.has(integrante.id)) {
          actualizarIntegrante({
            id: integrante.id,
            numero: integrante.numero,
            apellidos: integrante.apellidos,
            nombres: integrante.nombres,
            cedula_tipo: integrante.cedula_tipo,
            cedula_numero: integrante.cedula_numero,
            fecha_nacimiento: integrante.fecha_nacimiento,
            sexo: integrante.sexo,
            parentesco: integrante.parentesco,
            nivel_instruccion: integrante.nivel_instruccion,
            profesion: integrante.profesion,
          });
          idsEnviados.add(integrante.id);
        } else {
          const nuevoId = insertarIntegrante({
            vivienda_id: id,
            numero: integrante.numero ?? existentes.length + 1,
            apellidos: integrante.apellidos,
            nombres: integrante.nombres,
            cedula_tipo: integrante.cedula_tipo,
            cedula_numero: integrante.cedula_numero,
            fecha_nacimiento: integrante.fecha_nacimiento,
            sexo: integrante.sexo,
            parentesco: integrante.parentesco,
            nivel_instruccion: integrante.nivel_instruccion,
            profesion: integrante.profesion,
          });
          idsEnviados.add(nuevoId);
        }
      }

      for (const existente of existentes) {
        if (!idsEnviados.has(existente.id)) {
          eliminarIntegrante(existente.id);
        }
      }
    }

    const expediente = obtenerExpedienteVivienda(id);
    return res.json({ ok: true, expediente });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/viviendas/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de vivienda inválido.' });
    }

    if (!claveAdministracionValida(req.body.clave || req.query.clave)) {
      return res.status(403).json({ error: 'Contraseña de administración requerida.' });
    }

    if (!eliminarVivienda(id)) {
      return res.status(404).json({ error: 'Vivienda no encontrada.' });
    }

    return res.json({ ok: true, mensaje: 'Vivienda eliminada.' });
  } catch (error) {
    return next(error);
  }
});

app.patch('/api/viviendas/:id/sincronizar-neon', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de vivienda inválido.' });
    }

    const { sincronizar_neon } = req.body;
    if (typeof sincronizar_neon !== 'boolean') {
      return res.status(400).json({ error: 'El campo sincronizar_neon es requerido (booleano).' });
    }

    if (!cambiarSincronizarNeon(id, sincronizar_neon)) {
      return res.status(404).json({ error: 'Vivienda no encontrada.' });
    }

    const vivienda = obtenerViviendaPorId(id);
    return res.json({
      ok: true,
      mensaje: sincronizar_neon
        ? 'La vivienda se subirá a Neon en la próxima sincronización.'
        : 'La vivienda se mantendrá solo en local.',
      vivienda: {
        id: vivienda!.id,
        sincronizar_neon: vivienda!.sincronizar_neon,
      },
    });
  } catch (error) {
    return next(error);
  }
});

// ============================================================================
// API REST - INTEGRANTES (Nivel C: Grupo Familiar)
// ============================================================================

app.post('/api/viviendas/:viviendaId/integrantes', (req: Request, res: Response, next: NextFunction) => {
  try {
    const viviendaId = Number(req.params.viviendaId);
    if (!Number.isInteger(viviendaId) || viviendaId <= 0) {
      return res.status(400).json({ error: 'ID de vivienda inválido.' });
    }

    const { numero, apellidos, nombres, cedula_tipo, cedula_numero, fecha_nacimiento, sexo, parentesco, nivel_instruccion, profesion } = req.body;

    if (!apellidos || !nombres || !parentesco) {
      return res.status(400).json({ error: 'Apellidos, nombres y parentesco son obligatorios.' });
    }

    const existentes = obtenerIntegrantesPorVivienda(viviendaId);
    const num = numero ?? (existentes.length + 1);

    const id = insertarIntegrante({
      vivienda_id: viviendaId,
      numero: num,
      apellidos,
      nombres,
      cedula_tipo,
      cedula_numero,
      fecha_nacimiento,
      sexo,
      parentesco,
      nivel_instruccion,
      profesion,
    });

    return res.status(201).json({ ok: true, id, mensaje: 'Integrante agregado.' });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/viviendas/:viviendaId/integrantes/:integranteId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const integranteId = Number(req.params.integranteId);
    if (!Number.isInteger(integranteId) || integranteId <= 0) {
      return res.status(400).json({ error: 'ID de integrante inválido.' });
    }

    const { numero, apellidos, nombres, cedula_tipo, cedula_numero, fecha_nacimiento, sexo, parentesco, nivel_instruccion, profesion } = req.body;

    if (!actualizarIntegrante({
      id: integranteId,
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
    })) {
      return res.status(404).json({ error: 'Integrante no encontrado.' });
    }

    return res.json({ ok: true, mensaje: 'Integrante actualizado.' });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/viviendas/:viviendaId/integrantes/:integranteId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const integranteId = Number(req.params.integranteId);
    if (!Number.isInteger(integranteId) || integranteId <= 0) {
      return res.status(400).json({ error: 'ID de integrante inválido.' });
    }

    if (!eliminarIntegrante(integranteId)) {
      return res.status(404).json({ error: 'Integrante no encontrado.' });
    }

    return res.json({ ok: true, mensaje: 'Integrante eliminado.' });
  } catch (error) {
    return next(error);
  }
});

// ============================================================================
// EXPORTACIÓN PDF/EXCEL
// ============================================================================

app.get('/api/export/csv', (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req.query.q as string) || '';
    const like = `%${q}%`;

    const viviendas = db
      .prepare(`
        SELECT v.*, j.nombres AS jefe_nombres, j.apellidos AS jefe_apellidos, j.cedula_tipo, j.cedula_numero
        FROM viviendas v
        LEFT JOIN jefes_familia j ON j.vivienda_id = v.id
        WHERE v.comunidad LIKE ? OR v.manzana LIKE ? OR v.etapa LIKE ? OR v.direccion LIKE ? OR v.numero_casa LIKE ?
        ORDER BY v.fecha_registro DESC
      `)
      .all(like, like, like, like, like) as any[];

    const cabecera = [
      'ID Vivienda',
      'Estado',
      'Municipio',
      'Parroquia',
      'Comunidad',
      'Etapa',
      'Manzana',
      'Dirección',
      'Número Casa',
      'Jefe Cédula',
      'Jefe Nombres',
      'Jefe Apellidos',
      'Fecha Registro',
    ];

    const filas = viviendas.map((v: any) => [
      v.id,
      v.estado,
      v.municipio,
      v.parroquia,
      v.comunidad,
      v.etapa || '',
      v.manzana || '',
      v.direccion,
      v.numero_casa || '',
      `${v.cedula_tipo || ''}-${v.cedula_numero || ''}`,
      v.jefe_nombres || '',
      v.jefe_apellidos || '',
      formatearFecha(v.fecha_registro),
    ]);

    const contenido =
      '\uFEFF' +
      [cabecera, ...filas]
        .map((fila: any[]) => fila.map(escaparCsv).join(';'))
        .join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="censo_viviendas.csv"');
    return res.send(contenido);
  } catch (error) {
    return next(error);
  }
});

// ============================================================================
// PANEL DE ADMINISTRACIÓN
// ============================================================================

function mensajeQuery(req: Request, clave: string): string | null {
  const valor = req.query[clave];
  return typeof valor === 'string' ? valor.slice(0, 300) : null;
}

app.get('/admin', requerirAdmin, (req: Request, res: Response) => {
  return res.render('admin/index', {
    stats: {
      viviendas: contarViviendas(),
      personas: contarPersonas(),
      usuarios: listarUsuarios().length,
      comunidades: listarTerritorios({ tipo: 'comunidad' }).length,
      manzanas: listarTerritorios({ tipo: 'manzana' }).length,
      campos: listarConfigCampos().length,
    },
  });
});

// --- Usuarios ---
app.get('/admin/usuarios', requerirAdmin, (req: Request, res: Response) => {
  return res.render('admin/usuarios', {
    usuarios: listarUsuarios(),
    ok: mensajeQuery(req, 'ok'),
    error: mensajeQuery(req, 'error'),
    usuarioSesion: res.locals.usuario,
  });
});

app.post('/admin/usuarios', requerirAdmin, (req: Request, res: Response) => {
  try {
    const usuario = valorSimple(req.body.usuario).toLowerCase();
    const nombre = normalizarNombre(req.body.nombre);
    const clave = typeof req.body.clave === 'string' ? req.body.clave : '';
    const rol = valorSimple(req.body.rol) === 'admin' ? 'admin' : 'gestor';

    if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) {
      return res.redirect('/admin/usuarios?error=' + encodeURIComponent('El usuario debe tener entre 3 y 30 caracteres (letras, números, punto, guion).'));
    }
    if (!nombre) {
      return res.redirect('/admin/usuarios?error=' + encodeURIComponent('El nombre es obligatorio.'));
    }
    if (clave.length < 4) {
      return res.redirect('/admin/usuarios?error=' + encodeURIComponent('La contraseña debe tener al menos 4 caracteres.'));
    }
    if (obtenerUsuarioPorUsuario(usuario)) {
      return res.redirect('/admin/usuarios?error=' + encodeURIComponent('Ya existe un usuario con ese nombre.'));
    }

    crearUsuario({ usuario, nombre, clave, rol });
    return res.redirect('/admin/usuarios?ok=' + encodeURIComponent('Usuario creado correctamente.'));
  } catch (error) {
    return res.redirect('/admin/usuarios?error=' + encodeURIComponent('No se pudo crear el usuario.'));
  }
});

app.post('/admin/usuarios/:id/editar', requerirAdmin, (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.redirect('/admin/usuarios?error=' + encodeURIComponent('Usuario inválido.'));
    }

    const actual = obtenerUsuarioPorId(id);
    if (!actual) {
      return res.redirect('/admin/usuarios?error=' + encodeURIComponent('Usuario no encontrado.'));
    }

    const nombre = normalizarNombre(req.body.nombre);
    const rol = valorSimple(req.body.rol) === 'admin' ? 'admin' : 'gestor';
    const activo = ['on', '1', 'true'].includes(valorSimple(req.body.activo));
    const clave = typeof req.body.clave === 'string' ? req.body.clave.trim() : '';

    const quitaAdmin = actual.rol === 'admin' && (rol !== 'admin' || !activo);
    if (quitaAdmin && actual.activo && contarAdminsActivos() <= 1) {
      return res.redirect('/admin/usuarios?error=' + encodeURIComponent('Debe existir al menos un administrador activo.'));
    }

    actualizarUsuario({ id, nombre: nombre || undefined, rol, activo, clave: clave || null });
    return res.redirect('/admin/usuarios?ok=' + encodeURIComponent('Usuario actualizado.'));
  } catch (error) {
    return res.redirect('/admin/usuarios?error=' + encodeURIComponent('No se pudo actualizar el usuario.'));
  }
});

app.post('/admin/usuarios/:id/eliminar', requerirAdmin, (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const actual = obtenerUsuarioPorId(id);
    const usuarioSesion = res.locals.usuario as any;

    if (!actual) {
      return res.redirect('/admin/usuarios?error=' + encodeURIComponent('Usuario no encontrado.'));
    }
    if (usuarioSesion && usuarioSesion.id === id) {
      return res.redirect('/admin/usuarios?error=' + encodeURIComponent('No puede eliminar su propio usuario.'));
    }
    if (actual.rol === 'admin' && actual.activo && contarAdminsActivos() <= 1) {
      return res.redirect('/admin/usuarios?error=' + encodeURIComponent('Debe existir al menos un administrador activo.'));
    }

    eliminarUsuario(id);
    return res.redirect('/admin/usuarios?ok=' + encodeURIComponent('Usuario eliminado.'));
  } catch (error) {
    return res.redirect('/admin/usuarios?error=' + encodeURIComponent('No se pudo eliminar el usuario.'));
  }
});

// --- Territorio ---
app.get('/admin/territorio', requerirAdmin, (req: Request, res: Response) => {
  return res.render('admin/territorio', {
    territorios: listarTerritorios({ soloActivos: false }),
    ok: mensajeQuery(req, 'ok'),
    error: mensajeQuery(req, 'error'),
  });
});

app.post('/admin/territorio', requerirAdmin, (req: Request, res: Response) => {
  try {
    const etapaNombre = normalizarNombre(req.body.etapa);
    const manzanaNombre = normalizarNombre(req.body.manzana);

    if (!etapaNombre && !manzanaNombre) {
      return res.redirect('/admin/territorio?error=' + encodeURIComponent('Escriba una etapa o una manzana.'));
    }

    const agregados: string[] = [];

    if (etapaNombre) {
      const existente = listarTerritorios({ tipo: 'etapa' })
        .find((t: any) => t.nombre.toLowerCase() === etapaNombre.toLowerCase());
      if (!existente) {
        crearTerritorio({ tipo: 'etapa', nombre: etapaNombre });
        agregados.push('etapa');
      }
    }

    if (manzanaNombre) {
      const existente = listarTerritorios({ tipo: 'manzana' })
        .find((t: any) => t.nombre.toLowerCase() === manzanaNombre.toLowerCase());
      if (!existente) {
        crearTerritorio({ tipo: 'manzana', nombre: manzanaNombre });
        agregados.push('manzana');
      }
    }

    if (!agregados.length) {
      return res.redirect('/admin/territorio?error=' + encodeURIComponent('Ya existían los valores indicados.'));
    }

    return res.redirect('/admin/territorio?ok=' + encodeURIComponent('Se agregó: ' + agregados.join(' y ') + '.'));
  } catch (error) {
    return res.redirect('/admin/territorio?error=' + encodeURIComponent('No se pudo agregar.'));
  }
});

app.post('/admin/territorio/:id/editar', requerirAdmin, (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const nombre = normalizarNombre(req.body.nombre);
    const padreRaw = valorSimple(req.body.padre_id);
    const padreId = padreRaw ? Number(padreRaw) : null;
    const activo = ['on', '1', 'true'].includes(valorSimple(req.body.activo));

    if (!obtenerTerritorioPorId(id)) {
      return res.redirect('/admin/territorio?error=' + encodeURIComponent('Territorio no encontrado.'));
    }

    actualizarTerritorio({
      id,
      nombre: nombre || undefined,
      padre_id: Number.isInteger(padreId as number) ? padreId : null,
      activo,
    });
    return res.redirect('/admin/territorio?ok=' + encodeURIComponent('Territorio actualizado.'));
  } catch (error) {
    return res.redirect('/admin/territorio?error=' + encodeURIComponent('No se pudo actualizar el territorio.'));
  }
});

app.post('/admin/territorio/:id/eliminar', requerirAdmin, (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    eliminarTerritorio(id);
    return res.redirect('/admin/territorio?ok=' + encodeURIComponent('Territorio eliminado.'));
  } catch (error) {
    return res.redirect('/admin/territorio?error=' + encodeURIComponent('No se pudo eliminar el territorio.'));
  }
});

// --- Configurador de formulario ---
app.get('/admin/formulario', requerirAdmin, (req: Request, res: Response) => {
  const campos = listarConfigCampos();
  const secciones = [...new Set(campos.map((campo: any) => campo.seccion))];

  return res.render('admin/formulario', {
    campos,
    secciones,
    ok: mensajeQuery(req, 'ok'),
    error: mensajeQuery(req, 'error'),
  });
});

app.post('/admin/formulario', requerirAdmin, (req: Request, res: Response) => {
  try {
    const campos = listarConfigCampos();
    for (const campo of campos) {
      const visible = ['on', '1', 'true'].includes(valorSimple(req.body[`visible_${campo.clave}`]));
      const requerido = ['on', '1', 'true'].includes(valorSimple(req.body[`requerido_${campo.clave}`]));
      actualizarConfigCampo({ clave: campo.clave, visible, requerido });
    }
    return res.redirect('/admin/formulario?ok=' + encodeURIComponent('Configuración del formulario guardada.'));
  } catch (error) {
    return res.redirect('/admin/formulario?error=' + encodeURIComponent('No se pudo guardar la configuración.'));
  }
});

// --- API de territorios (para selects dependientes) ---
const TIPOS_TERRITORIO_VALIDOS = ['estado', 'municipio', 'parroquia', 'comunidad', 'etapa', 'manzana'];

app.get('/api/territorios', (req: Request, res: Response) => {
  const tipo = typeof req.query.tipo === 'string' ? req.query.tipo : null;
  const padreId = req.query.padre_id !== undefined ? Number(req.query.padre_id) : null;

  const territorios = listarTerritorios({
    tipo: tipo && TIPOS_TERRITORIO_VALIDOS.includes(tipo) ? (tipo as any) : null,
    padreId: Number.isInteger(padreId as number) ? padreId : null,
  });

  return res.json({ territorios });
});

// --- Exportaciones ---
function leerFiltrosPersonas(req: Request) {
  const numero = (valor: unknown) => {
    if (valor === undefined || valor === '') return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  };

  return {
    q: typeof req.query.q === 'string' ? req.query.q.trim() : '',
    sexo: typeof req.query.sexo === 'string' ? req.query.sexo : '',
    nivel: typeof req.query.nivel === 'string' ? req.query.nivel : '',
    trabaja: typeof req.query.trabaja === 'string' ? req.query.trabaja : '',
    parentesco: typeof req.query.parentesco === 'string' ? req.query.parentesco : '',
    manzana: typeof req.query.manzana === 'string' ? req.query.manzana : '',
    etapa: typeof req.query.etapa === 'string' ? req.query.etapa : '',
    comunidad: typeof req.query.comunidad === 'string' ? req.query.comunidad : '',
    tipo: typeof req.query.tipo === 'string' ? req.query.tipo : '',
    edadMin: numero(req.query.edad_min),
    edadMax: numero(req.query.edad_max),
  };
}

app.get('/api/export/personas.csv', (req: Request, res: Response) => {
  const { personas } = obtenerPersonas(leerFiltrosPersonas(req));

  const cabecera = [
    'Tipo',
    'Cédula',
    'Apellidos',
    'Nombres',
    'Edad',
    'Sexo',
    'Parentesco',
    'Nivel de instrucción',
    'Profesión',
    'Trabaja',
    'Comunidad',
    'Etapa',
    'Manzana',
    'Dirección',
    'Número de casa',
  ];

  const filas = personas.map((p: any) => [
    p.tipo === 'jefe' ? 'Jefe de Familia' : 'Integrante',
    p.cedula || '',
    p.apellidos,
    p.nombres,
    p.edad ?? '',
    p.sexo || '',
    p.parentesco || '',
    p.nivel_instruccion || '',
    p.profesion || '',
    p.trabaja_actual || '',
    p.comunidad || '',
    p.etapa || '',
    p.manzana || '',
    p.direccion || '',
    p.numero_casa || '',
  ]);

  const contenido =
    '\uFEFF' +
    [cabecera, ...filas]
      .map((fila: any[]) => fila.map(escaparCsv).join(';'))
      .join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="padron-personas.csv"');
  return res.send(contenido);
});

app.get('/api/export/viviendas.csv', (req: Request, res: Response) => {
  const { viviendas } = obtenerViviendas({ q: '', page: 1, limit: 100000 });

  const cabecera = [
    'N.º',
    'Estado',
    'Municipio',
    'Parroquia',
    'Comunidad',
    'Etapa',
    'Manzana',
    'Dirección',
    'Número de casa',
    'Jefe',
    'Cédula del jefe',
    'Integrantes',
  ];

  const filas = viviendas.map((v: any) => {
    const jefe = obtenerJefePorVivienda(v.id);
    const integrantes = obtenerIntegrantesPorVivienda(v.id);
    return [
      v.id,
      v.estado,
      v.municipio,
      v.parroquia,
      v.comunidad,
      v.etapa || '',
      v.manzana || '',
      v.direccion,
      v.numero_casa || '',
      jefe ? `${jefe.apellidos}, ${jefe.nombres}` : '',
      jefe ? `${jefe.cedula_tipo}-${jefe.cedula_numero}` : '',
      integrantes.length,
    ];
  });

  const contenido =
    '\uFEFF' +
    [cabecera, ...filas]
      .map((fila: any[]) => fila.map(escaparCsv).join(';'))
      .join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="padron-viviendas.csv"');
  return res.send(contenido);
});

app.get('/reportes/imprimir', (req: Request, res: Response) => {
  const { personas, total } = obtenerPersonas(leerFiltrosPersonas(req));
  return res.render('reporte', { personas, total, formatearFecha });
});

// ============================================================================
// API REST - SINCRONIZACIÓN CON NEON
// ============================================================================

app.post('/api/sincronizar', async (req: Request, res: Response) => {
  try {
    const { sincronizarConNeon } = require('./sincronizar');
    const resultado = await sincronizarConNeon();

    if (!resultado.ok) {
      return res.status(400).json(resultado);
    }

    return res.json(resultado);
  } catch (error: any) {
    console.error('[sync]', error);
    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        'No se pudo conectar con Neon. Verifique la conexión a Internet y DATABASE_URL.',
    });
  }
});

// ============================================================================
// MIDDLEWARE DE ERROR Y 404
// ============================================================================

app.use((req: Request, res: Response) => {
  res.status(404).type('text/plain').send('Ruta no encontrada.');
});

app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[error]', error);

  if (res.headersSent) return next(error);

  try {
    if (req.path.endsWith('.csv')) {
      return res.status(500).type('text/plain').send('No se pudo generar el archivo CSV.');
    }

    if (req.path.startsWith('/campos')) {
      return renderizarCampos(res, {
        status: 500,
        error: 'Ocurrió un error interno al procesar la solicitud.',
      });
    }

    if (req.path.startsWith('/api')) {
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }

    return renderizar(res, {
      status: 500,
      error: 'Ocurrió un error interno al procesar la solicitud.',
    });
  } catch {
    return res.status(500).type('text/plain').send('Error interno del servidor.');
  }
});

function direccionesDeRed(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((conexion: any) => conexion && conexion.family === 'IPv4' && !conexion.internal)
    .map((conexion: any) => conexion.address);
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
