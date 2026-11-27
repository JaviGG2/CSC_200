import type { Request, Response } from 'express';
import { verificarClave } from '../../nucleo/autenticacion';
import {
  CAMPOS_OPCIONES,
  CLAVES_RESERVADAS,
  TIPOS_CAMPO,
  actualizarViviendaEnNeon,
  eliminarRegistroEnNeon,
  encolarEliminacionNeon,
  listarCamposConOpciones,
  listarConsejosComunales,
  listarOpcionesCampo,
  marcarViviendaPendienteSincronizacion,
  obtenerCampoPorId,
  obtenerCampos,
  obtenerCamposFormulario,
  obtenerConsejoComunalPorId,
  obtenerEstadisticasViviendas,
  obtenerExpedienteVivienda,
  obtenerRegistroPorId,
  obtenerUsuarioConHashPorId,
  obtenerViviendas,
} from '../../nucleo/base-datos';
import {
  escaparCsv,
  formatearFecha,
  normalizarBusqueda,
  normalizarCedula,
  normalizarFecha,
  normalizarNombre,
  valorSimple,
} from '../../nucleo/http';

export const TIPOS_CAMPO_ETIQUETADOS = [
  { valor: 'text', etiqueta: 'Texto corto' },
  { valor: 'textarea', etiqueta: 'Párrafo' },
  { valor: 'number', etiqueta: 'Número' },
  { valor: 'date', etiqueta: 'Fecha' },
  { valor: 'tel', etiqueta: 'Teléfono' },
  { valor: 'email', etiqueta: 'Correo' },
  { valor: 'select', etiqueta: 'Lista de opciones' },
];

export const ETIQUETAS_TIPO = Object.fromEntries(
  TIPOS_CAMPO_ETIQUETADOS.map((tipo) => [tipo.valor, tipo.etiqueta])
);

export const TIPOS_TERRITORIO_VALIDOS = [
  'estado',
  'municipio',
  'parroquia',
  'comunidad',
  'etapa',
  'manzana',
];

export function claveAdministracionValida(
  valor: unknown,
  usuarioId?: number | null
): boolean {
  const claveIngresada = valorSimple(valor);
  if (!claveIngresada) return false;

  if (process.env.CLAVE_ADMIN && claveIngresada === process.env.CLAVE_ADMIN) {
    return true;
  }

  if (usuarioId && Number.isInteger(usuarioId) && usuarioId > 0) {
    const usuario = obtenerUsuarioConHashPorId(usuarioId);
    if (usuario && verificarClave(claveIngresada, usuario.clave_hash)) {
      return true;
    }
    return false;
  }

  return !process.env.CLAVE_ADMIN && claveIngresada === 'csc200';
}

export function esFechaFutura(fechaIso: string | null | undefined): boolean {
  if (!fechaIso) return false;
  const dia = String(fechaIso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const hoy = new Date();
  const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  return dia > hoyIso;
}

export function personaCoincide(persona: any, busqueda: string): boolean {
  if (!persona) return false;
  const cedula =
    persona.cedula_tipo && persona.cedula_numero
      ? `${persona.cedula_tipo}-${persona.cedula_numero}`
      : '';
  return [
    persona.nombres,
    persona.apellidos,
    persona.cedula_numero,
    cedula,
    persona.profesion,
    persona.parentesco,
  ].some((valor) => normalizarBusqueda(valor).includes(busqueda));
}

export function viviendaCoincide(vivienda: any, busqueda: string): boolean {
  if (!busqueda) return true;

  const campos = [
    vivienda.comunidad,
    vivienda.consejo_nombre,
    vivienda.etapa,
    vivienda.manzana,
    vivienda.direccion,
    vivienda.numero_casa,
    vivienda.numero_anexo,
  ];
  if (campos.some((valor) => normalizarBusqueda(valor).includes(busqueda))) return true;
  if (personaCoincide(vivienda.jefe, busqueda)) return true;

  return (vivienda.integrantes || []).some((persona: any) =>
    personaCoincide(persona, busqueda)
  );
}

export function construirCensoFiltrado({
  consejo = '',
  q = '',
}: {
  consejo?: string;
  q?: string;
}) {
  const { viviendas } = obtenerViviendas({ q: '', page: 1, limit: 100000 });

  const registros = viviendas.map((vivienda: any) => {
    const expediente = obtenerExpedienteVivienda(vivienda.id);
    const consejoLocal = vivienda.consejo_comunal_id
      ? obtenerConsejoComunalPorId(vivienda.consejo_comunal_id)
      : null;

    return {
      ...vivienda,
      consejo_nombre: consejoLocal?.nombre || vivienda.comunidad || '',
      jefe: expediente?.jefe ?? null,
      integrantes: expediente?.integrantes ?? [],
    };
  });

  const consejoBuscado = normalizarBusqueda(consejo);
  const filtrados = consejoBuscado
    ? registros.filter(
        (registro: any) =>
          normalizarBusqueda(registro.consejo_nombre) === consejoBuscado ||
          normalizarBusqueda(registro.comunidad) === consejoBuscado
      )
    : registros;

  const grupos: any[] = [];
  const porId = new Map<number, any>();

  for (const registro of filtrados) {
    if (!registro.es_anexo) {
      const grupo = { ...registro, anexos: [] as any[] };
      grupos.push(grupo);
      porId.set(registro.id, grupo);
    }
  }

  for (const registro of filtrados) {
    if (!registro.es_anexo) continue;
    const principal = registro.vivienda_principal_id
      ? porId.get(registro.vivienda_principal_id)
      : null;

    if (principal) {
      principal.anexos.push(registro);
    } else {
      grupos.push({ ...registro, anexos: [] });
    }
  }

  const busqueda = normalizarBusqueda(q);
  const visibles = busqueda
    ? grupos.filter((grupo) =>
        [grupo, ...grupo.anexos].some((vivienda: any) =>
          viviendaCoincide(vivienda, busqueda)
        )
      )
    : grupos;

  let anexos = 0;
  let personas = 0;
  for (const grupo of visibles) {
    anexos += grupo.anexos.length;
    personas += (grupo.jefe ? 1 : 0) + grupo.integrantes.length;
    for (const anexo of grupo.anexos) {
      personas += (anexo.jefe ? 1 : 0) + anexo.integrantes.length;
    }
  }

  visibles.sort((a, b) =>
    String(b.fecha_registro || '').localeCompare(String(a.fecha_registro || ''))
  );

  return {
    grupos: visibles,
    stats: { viviendas: visibles.length, anexos, personas },
  };
}

export async function propagarEliminacionNeon(
  entrada:
    | string
    | { cedula?: string | null; viviendaId?: number | null; tipo?: 'vivienda' | 'jefe' }
    | null
    | undefined
): Promise<string> {
  if (!entrada) return '';

  const payload =
    typeof entrada === 'string'
      ? { cedula: entrada, viviendaId: null, tipo: 'vivienda' as const }
      : {
          cedula: entrada.cedula ?? null,
          viviendaId: entrada.viviendaId ?? null,
          tipo: entrada.tipo ?? ('vivienda' as const),
        };

  if (!payload.cedula && !payload.viviendaId) return '';

  try {
    const resultado = await eliminarRegistroEnNeon(payload);

    if (!resultado.ok) {
      encolarEliminacionNeon(payload);
      return ' No se pudo eliminar de Neon; se reintentará al sincronizar.';
    }
    if (!resultado.configurado) {
      encolarEliminacionNeon(payload);
      return ' Neon no está configurado; la eliminación quedará en cola para el próximo sincronizado.';
    }
    if (resultado.aplicado) return ' También se eliminó de Neon.';
    return ' No había registro en Neon.';
  } catch {
    encolarEliminacionNeon(payload);
    return ' No se pudo eliminar de Neon; se reintentará al sincronizar.';
  }
}

export async function propagarActualizacionNeon(viviendaId: number): Promise<string> {
  try {
    const resultado = await actualizarViviendaEnNeon(viviendaId);

    if (!resultado.ok) {
      marcarViviendaPendienteSincronizacion(viviendaId);
      return ' No se pudo actualizar Neon; se reintentará al sincronizar.';
    }
    if (!resultado.configurado) return ' Neon no está configurado.';
    if (!resultado.aplicado) return ` ${resultado.mensaje}`;
    return ' La ficha se actualizó en Neon.';
  } catch {
    marcarViviendaPendienteSincronizacion(viviendaId);
    return ' No se pudo actualizar Neon; se reintentará al sincronizar.';
  }
}

type ResultadoExtras = { extras: Record<string, unknown> } | { error: string };
type ResultadoValidacion<T = any> = { error: string } | { datos: T };

export function tieneErrorExtras(r: ResultadoExtras): r is { error: string } {
  return 'error' in r;
}

export function tieneErrorValidacion<T>(r: ResultadoValidacion<T>): r is { error: string } {
  return 'error' in r;
}

export function recolectarExtras(campos: any[], cuerpo: any): ResultadoExtras {
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

export function validarDefinicionCampo(valoresCampo: any): ResultadoValidacion {
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

export function validarRegistro(valores: any): ResultadoValidacion {
  const cedula = normalizarCedula(valores.cedula);
  const nombres = normalizarNombre(valores.nombres);
  const apellidos = normalizarNombre(valores.apellidos);

  if (!cedula) return { error: 'La cédula es obligatoria.' };
  if (cedula.length > 30) return { error: 'La cédula no puede superar los 30 caracteres.' };
  if (!nombres || !apellidos) return { error: 'Los nombres y apellidos son obligatorios.' };
  if (nombres.length > 120 || apellidos.length > 120) {
    return { error: 'Los nombres y apellidos no pueden superar los 120 caracteres.' };
  }

  const fechaRegistro = normalizarFecha(valores.fecha_nacimiento);
  if (fechaRegistro === false) return { error: 'La fecha de nacimiento no es válida.' };

  const resultadoExtras = recolectarExtras(obtenerCamposFormulario(), valores);
  if (tieneErrorExtras(resultadoExtras)) return { error: resultadoExtras.error };

  return {
    datos: {
      cedula,
      nombres,
      apellidos,
      fechaRegistro,
      extras: resultadoExtras.extras,
    },
  };
}

export function leerNuevoCampo(req: Request): string | null {
  return typeof req.query.nuevo === 'string' && /^[a-z0-9_]+$/.test(req.query.nuevo)
    ? req.query.nuevo
    : null;
}

export function obtenerCamposAdministrables() {
  return obtenerCampos({ soloActivos: false }).filter(
    (campo: any) => !CLAVES_RESERVADAS.includes(campo.clave)
  );
}

export function obtenerCampoAdministrable(id: unknown) {
  const numeroId = Number(id);
  if (!Number.isInteger(numeroId) || numeroId <= 0) return null;

  const campo = obtenerCampoPorId(numeroId);
  if (!campo || CLAVES_RESERVADAS.includes(campo.clave)) return null;

  return campo;
}

export function obtenerRegistroEditable(param: unknown) {
  const id = Number(param);
  if (!Number.isInteger(id) || id <= 0) return null;
  return obtenerRegistroPorId(id);
}

export function renderizar(
  res: Response,
  { status = 200, error = null, ok = null }: any = {}
) {
  const { grupos, stats } = construirCensoFiltrado({});

  return res.status(status).render('index', {
    ok,
    error,
    consejos: listarConsejosComunales(),
    filtros: { consejo: '', q: '' },
    grupos,
    stats,
    statsSync: obtenerEstadisticasViviendas(),
    configNeon: null,
    esAdmin: (res.locals.usuario as any)?.rol === 'admin',
  });
}

export function renderizarEdicion(
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

export function renderizarCampos(
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

export function listarGruposOpciones() {
  const campos = [
    ...new Set([...Object.keys(CAMPOS_OPCIONES), ...listarCamposConOpciones()]),
  ];

  return campos.map((campo) => ({
    campo,
    etiqueta: CAMPOS_OPCIONES[campo] || campo,
    opciones: listarOpcionesCampo(campo, { soloActivas: false }),
  }));
}

export function leerFiltrosPersonas(req: Request) {
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

export function normalizarCabeceraCsv(valor: string): string {
  return String(valor || '')
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function parsearFilaCsv(linea: string, separador: string): string[] {
  const campos: string[] = [];
  let actual = '';
  let enComillas = false;

  for (let i = 0; i < linea.length; i += 1) {
    const ch = linea[i];
    if (ch === '"') {
      if (enComillas && linea[i + 1] === '"') {
        actual += '"';
        i += 1;
      } else {
        enComillas = !enComillas;
      }
    } else if (ch === separador && !enComillas) {
      campos.push(actual.trim());
      actual = '';
    } else {
      actual += ch;
    }
  }
  campos.push(actual.trim());
  return campos;
}

export function normalizarFechaCsv(valor: string): string | false | null {
  const limpio = valorSimple(valor);
  if (!limpio) return null;

  const iso = normalizarFecha(limpio);
  if (iso !== false) return iso.slice(0, 10);

  const latam = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/.exec(limpio);
  if (latam) {
    const [, dia, mes, anio] = latam;
    const verificada = normalizarFecha(`${anio}-${mes}-${dia}`);
    if (verificada !== false) return `${anio}-${mes}-${dia}`;
  }

  return false;
}

export function generarCsvDesdeTabla(cabecera: string[], filas: unknown[][]): string {
  return (
    '\uFEFF' +
    [cabecera, ...filas].map((fila) => fila.map(escaparCsv).join(';')).join('\r\n')
  );
}
