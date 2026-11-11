import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import {
  db,
  obtenerJefePorVivienda,
  obtenerIntegrantesPorVivienda,
  listarEliminacionesNeon,
  eliminarEliminacionNeon,
  marcarViviendaSincronizada,
} from './db';

dotenv.config({ quiet: true });

const TAMANO_LOTE = 100;
const RUTA_ESQUEMA = path.join(process.cwd(), 'sql', 'neon_schema.sql');

export type ViviendaFallida = {
  id: number;
  motivo: string;
};

export type ResultadoSincronizacion = {
  ok: boolean;
  pendientes: number;
  procesados: number;
  conflictos: number;
  fallidas: ViviendaFallida[];
  omitidas: { soloLocal: number[]; sinJefe: number[] };
  mensaje: string;
};

export type ResultadoNeon = {
  ok: boolean;
  configurado: boolean;
  aplicado: boolean;
  mensaje: string;
};

type ViviendaBase = {
  id: number;
  comunidad: string;
  etapa: string | null;
  manzana: string | null;
  direccion: string;
  numero_casa: string | null;
  fecha_registro: string;
};

type ViviendaPendiente = ViviendaBase & {
  cedula: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string | null;
  datos_extras: Record<string, unknown>;
};

function detalleError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function crearClienteNeon(): Client | null {
  const cadenaConexion = process.env.DATABASE_URL;
  if (!cadenaConexion) return null;

  return new Client({
    connectionString: cadenaConexion,
    connectionTimeoutMillis: 8000,
  });
}

// Clave en Neon del jefe de familia. Quien no tiene cédula recibe una clave
// estable por vivienda para no confundirlo con otra persona sin cédula.
function cedulaNeonJefe(
  viviendaId: number,
  tipo: string | null,
  numero: string | null
): string {
  return (tipo === 'V' || tipo === 'E') && numero ? `${tipo}-${numero}` : `S-${viviendaId}`;
}

export function construirRegistroNeon(viviendaId: number): ViviendaPendiente | null {
  const vivienda = db
    .prepare(`
      SELECT id, comunidad, etapa, manzana, direccion, numero_casa, fecha_registro
      FROM viviendas
      WHERE id = ?
    `)
    .get(viviendaId) as ViviendaBase | undefined;

  if (!vivienda) return null;

  const jefe = obtenerJefePorVivienda(viviendaId);
  if (!jefe) return null;

  const integrantes = obtenerIntegrantesPorVivienda(viviendaId);

  return {
    ...vivienda,
    cedula: cedulaNeonJefe(vivienda.id, jefe.cedula_tipo, jefe.cedula_numero),
    nombres: jefe.nombres,
    apellidos: jefe.apellidos,
    fecha_nacimiento: jefe.fecha_nacimiento,
    datos_extras: {
      comunidad: vivienda.comunidad,
      etapa: vivienda.etapa,
      manzana: vivienda.manzana,
      direccion: vivienda.direccion,
      numero_casa: vivienda.numero_casa,
      fecha_registro_vivienda: vivienda.fecha_registro,
      jefe: {
        cedula: cedulaNeonJefe(vivienda.id, jefe.cedula_tipo, jefe.cedula_numero),
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
      },
      integrantes: integrantes.map((integrante) => ({
        numero: integrante.numero,
        apellidos: integrante.apellidos,
        nombres: integrante.nombres,
        cedula:
          integrante.cedula_tipo && integrante.cedula_numero
            ? `${integrante.cedula_tipo}-${integrante.cedula_numero}`
            : null,
        fecha_nacimiento: integrante.fecha_nacimiento,
        sexo: integrante.sexo,
        parentesco: integrante.parentesco,
        nivel_instruccion: integrante.nivel_instruccion,
        profesion: integrante.profesion,
      })),
    },
  };
}

// Clasifica TODAS las viviendas sin subir, para no perder ninguna en silencio:
// las que se pueden subir, las marcadas como "Solo local" y las que no tienen jefe.
function clasificarViviendasSinSubir(): {
  subibles: number[];
  soloLocal: number[];
  sinJefe: number[];
} {
  const filas = db
    .prepare(`
      SELECT v.id, v.sincronizar_neon, j.id AS jefe_id
      FROM viviendas v
      LEFT JOIN jefes_familia j ON j.vivienda_id = v.id
      WHERE v.sincronizado = 0
      ORDER BY v.id
    `)
    .all() as Array<{ id: number; sincronizar_neon: number; jefe_id: number | null }>;

  const resultado: { subibles: number[]; soloLocal: number[]; sinJefe: number[] } = {
    subibles: [],
    soloLocal: [],
    sinJefe: [],
  };

  for (const fila of filas) {
    if (!fila.sincronizar_neon) {
      resultado.soloLocal.push(fila.id);
    } else if (fila.jefe_id === null) {
      resultado.sinJefe.push(fila.id);
    } else {
      resultado.subibles.push(fila.id);
    }
  }

  return resultado;
}

function construirPendientes(ids: number[]): ViviendaPendiente[] {
  const pendientes: ViviendaPendiente[] = [];
  for (const id of ids) {
    const registro = construirRegistroNeon(id);
    if (registro) pendientes.push(registro);
  }
  return pendientes;
}

function listarIds(ids: number[], maximo = 10): string {
  const visibles = ids.slice(0, maximo).map((id) => `N.º ${id}`);
  const restantes = ids.length - visibles.length;
  return restantes > 0 ? `${visibles.join(', ')} y ${restantes} más` : visibles.join(', ');
}

function describirOmitidas(
  soloLocal: number[],
  sinJefe: number[],
  fallidas: ViviendaFallida[]
): string[] {
  const partes: string[] = [];

  if (sinJefe.length) {
    partes.push(
      `${sinJefe.length} vivienda(s) sin jefe de familia no se pudieron subir (${listarIds(sinJefe)})`
    );
  }

  if (soloLocal.length) {
    partes.push(
      `${soloLocal.length} vivienda(s) marcada(s) como «Solo local» no se suben a Neon (${listarIds(soloLocal)})`
    );
  }

  if (fallidas.length) {
    partes.push(
      `${fallidas.length} vivienda(s) fallaron al subir (${fallidas
        .slice(0, 5)
        .map((fallida) => `N.º ${fallida.id}: ${fallida.motivo}`)
        .join('; ')}${fallidas.length > 5 ? '; …' : ''})`
    );
  }

  return partes;
}

function prepararUpsert(registros: ViviendaPendiente[]): {
  texto: string;
  valores: unknown[];
} {
  const valores: unknown[] = [];
  const filas = registros.map((registro, indice) => {
    const base = indice * 6;
    valores.push(
      registro.cedula,
      registro.nombres,
      registro.apellidos,
      registro.fecha_nacimiento ?? registro.fecha_registro,
      JSON.stringify(registro.datos_extras),
      registro.comunidad
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, ($${base + 4})::timestamp AT TIME ZONE 'America/Caracas', ($${base + 5})::jsonb, $${base + 6})`;
  });

  const texto = `
    INSERT INTO registros_censo
      (cedula, nombres, apellidos, fecha_nacimiento, datos_extras, sector)
    VALUES
      ${filas.join(', ')}
    ON CONFLICT (cedula) DO UPDATE SET
      nombres = EXCLUDED.nombres,
      apellidos = EXCLUDED.apellidos,
      fecha_nacimiento = EXCLUDED.fecha_nacimiento,
      datos_extras = EXCLUDED.datos_extras,
      sector = EXCLUDED.sector
  `;

  return { texto, valores };
}

async function upsertRegistros(
  cliente: Client,
  registros: ViviendaPendiente[]
): Promise<number> {
  if (!registros.length) return 0;

  const { texto, valores } = prepararUpsert(registros);

  await cliente.query('BEGIN');
  try {
    const resultado = await cliente.query(texto, valores);
    await cliente.query('COMMIT');
    return resultado.rowCount ?? registros.length;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  }
}

// Si el lote falla completo (por ejemplo, por un dato inválido), reintenta
// registro por registro para aislar el error y no bloquear al resto.
async function subirLote(
  cliente: Client,
  lote: ViviendaPendiente[]
): Promise<{ subidas: ViviendaPendiente[]; fallidas: ViviendaFallida[] }> {
  try {
    await upsertRegistros(cliente, lote);
    return { subidas: lote, fallidas: [] };
  } catch (errorLote) {
    if (lote.length === 1) {
      return { subidas: [], fallidas: [{ id: lote[0].id, motivo: detalleError(errorLote) }] };
    }

    const subidas: ViviendaPendiente[] = [];
    const fallidas: ViviendaFallida[] = [];

    for (const registro of lote) {
      try {
        await upsertRegistros(cliente, [registro]);
        subidas.push(registro);
      } catch (error) {
        fallidas.push({ id: registro.id, motivo: detalleError(error) });
      }
    }

    return { subidas, fallidas };
  }
}

async function procesarEliminacionesNeon(cliente: Client): Promise<number> {
  const pendientes = listarEliminacionesNeon();
  let procesadas = 0;

  for (const eliminacion of pendientes) {
    await cliente.query('DELETE FROM registros_censo WHERE cedula = $1', [
      eliminacion.cedula,
    ]);
    eliminarEliminacionNeon(eliminacion.id);
    procesadas += 1;
  }

  return procesadas;
}

// Elimina de Neon el registro de una vivienda identificado por la cédula del jefe.
export async function eliminarRegistroEnNeon(cedula: string): Promise<ResultadoNeon> {
  const cliente = crearClienteNeon();

  if (!cliente) {
    return {
      ok: true,
      configurado: false,
      aplicado: false,
      mensaje: 'DATABASE_URL no está configurada.',
    };
  }

  try {
    await cliente.connect();
    const resultado = await cliente.query(
      'DELETE FROM registros_censo WHERE cedula = $1',
      [cedula]
    );
    const eliminados = resultado.rowCount ?? 0;

    return {
      ok: true,
      configurado: true,
      aplicado: eliminados > 0,
      mensaje:
        eliminados > 0
          ? 'Registro eliminado de Neon.'
          : 'No había un registro de esta vivienda en Neon.',
    };
  } catch (error) {
    return {
      ok: false,
      configurado: true,
      aplicado: false,
      mensaje: detalleError(error),
    };
  } finally {
    await cliente.end().catch(() => {});
  }
}

// Vuelve a subir la ficha completa de una vivienda (por ejemplo, tras borrar un integrante).
export async function actualizarViviendaEnNeon(viviendaId: number): Promise<ResultadoNeon> {
  const vivienda = db
    .prepare('SELECT sincronizado, sincronizar_neon FROM viviendas WHERE id = ?')
    .get(viviendaId) as { sincronizado: number; sincronizar_neon: number } | undefined;

  if (!vivienda) {
    return {
      ok: true,
      configurado: true,
      aplicado: false,
      mensaje: 'La vivienda no existe.',
    };
  }

  if (!vivienda.sincronizado && !vivienda.sincronizar_neon) {
    return {
      ok: true,
      configurado: true,
      aplicado: false,
      mensaje: 'La vivienda está configurada solo en local.',
    };
  }

  const registro = construirRegistroNeon(viviendaId);

  if (!registro) {
    return {
      ok: true,
      configurado: true,
      aplicado: false,
      mensaje: 'La vivienda no tiene jefe de familia; no hay registro que actualizar en Neon.',
    };
  }

  const cliente = crearClienteNeon();

  if (!cliente) {
    return {
      ok: true,
      configurado: false,
      aplicado: false,
      mensaje: 'DATABASE_URL no está configurada.',
    };
  }

  try {
    await cliente.connect();
    await upsertRegistros(cliente, [registro]);
    marcarViviendaSincronizada(viviendaId);

    return {
      ok: true,
      configurado: true,
      aplicado: true,
      mensaje: 'Ficha de la vivienda actualizada en Neon.',
    };
  } catch (error) {
    return {
      ok: false,
      configurado: true,
      aplicado: false,
      mensaje: detalleError(error),
    };
  } finally {
    await cliente.end().catch(() => {});
  }
}

export async function sincronizarConNeon(): Promise<ResultadoSincronizacion> {
  const cadenaConexion = process.env.DATABASE_URL;
  const clasificacion = clasificarViviendasSinSubir();
  const omitidas = {
    soloLocal: clasificacion.soloLocal,
    sinJefe: clasificacion.sinJefe,
  };

  if (!cadenaConexion) {
    return {
      ok: false,
      pendientes: clasificacion.subibles.length,
      procesados: 0,
      conflictos: 0,
      fallidas: [],
      omitidas,
      mensaje:
        'Defina DATABASE_URL en el archivo .env con la cadena de conexión de Neon (sslmode=require).',
    };
  }

  if (!fs.existsSync(RUTA_ESQUEMA)) {
    return {
      ok: false,
      pendientes: clasificacion.subibles.length,
      procesados: 0,
      conflictos: 0,
      fallidas: [],
      omitidas,
      mensaje: `No se encontró el esquema de Neon en ${RUTA_ESQUEMA}.`,
    };
  }

  const pendientes = construirPendientes(clasificacion.subibles);
  const eliminacionesPendientes = listarEliminacionesNeon().length;

  if (!pendientes.length && !eliminacionesPendientes) {
    const avisos = describirOmitidas(clasificacion.soloLocal, clasificacion.sinJefe, []);

    return {
      ok: true,
      pendientes: 0,
      procesados: 0,
      conflictos: 0,
      fallidas: [],
      omitidas,
      mensaje: avisos.length
        ? `No hay viviendas por subir. ${avisos.join('. ')}.`
        : 'No hay viviendas ni eliminaciones pendientes de sincronización.',
    };
  }

  const cliente = new Client({
    connectionString: cadenaConexion,
    connectionTimeoutMillis: 8000,
  });
  let procesados = 0;
  let eliminacionesProcesadas = 0;
  const fallidas: ViviendaFallida[] = [];

  try {
    await cliente.connect();

    const esquema = fs.readFileSync(RUTA_ESQUEMA, 'utf8');
    await cliente.query(esquema);

    eliminacionesProcesadas = await procesarEliminacionesNeon(cliente);

    for (let inicio = 0; inicio < pendientes.length; inicio += TAMANO_LOTE) {
      const lote = pendientes.slice(inicio, inicio + TAMANO_LOTE);
      const resultado = await subirLote(cliente, lote);

      for (const registro of resultado.subidas) {
        marcarViviendaSincronizada(registro.id);
      }

      procesados += resultado.subidas.length;
      fallidas.push(...resultado.fallidas);
    }

    const partes: string[] = [];
    if (procesados) partes.push(`${procesados} vivienda(s) subida(s)`);
    if (eliminacionesProcesadas) {
      partes.push(`${eliminacionesProcesadas} eliminación(es) propagada(s)`);
    }

    const avisos = describirOmitidas(
      clasificacion.soloLocal,
      clasificacion.sinJefe,
      fallidas
    );

    const resumen = partes.length
      ? `${partes.join(' y ')} en Neon`
      : 'sin envíos nuevos';

    return {
      ok: true,
      pendientes: pendientes.length,
      procesados,
      conflictos: 0,
      fallidas,
      omitidas,
      mensaje: `Sincronización completada: ${resumen}.${
        avisos.length ? ` ${avisos.join('. ')}.` : ''
      }`,
    };
  } finally {
    await cliente.end().catch(() => {});
  }
}

async function main() {
  try {
    const resultado = await sincronizarConNeon();
    console.log(resultado.mensaje);
    if (!resultado.ok) process.exitCode = 1;
  } catch (error: any) {
    console.error('No se pudo completar la sincronización:', error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
