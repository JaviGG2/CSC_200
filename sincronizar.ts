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

export type ResultadoSincronizacion = {
  ok: boolean;
  pendientes: number;
  procesados: number;
  conflictos: number;
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
    cedula: `${jefe.cedula_tipo}-${jefe.cedula_numero}`,
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
        cedula: `${jefe.cedula_tipo}-${jefe.cedula_numero}`,
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

function obtenerPendientes(): ViviendaPendiente[] {
  const filas = db
    .prepare(`
      SELECT id
      FROM viviendas
      WHERE sincronizado = 0
        AND sincronizar_neon = 1
      ORDER BY id
    `)
    .all() as Array<{ id: number }>;

  const pendientes: ViviendaPendiente[] = [];
  for (const fila of filas) {
    const registro = construirRegistroNeon(fila.id);
    if (registro) pendientes.push(registro);
  }
  return pendientes;
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

  if (!cadenaConexion) {
    return {
      ok: false,
      pendientes: 0,
      procesados: 0,
      conflictos: 0,
      mensaje:
        'Defina DATABASE_URL en el archivo .env con la cadena de conexión de Neon (sslmode=require).',
    };
  }

  if (!fs.existsSync(RUTA_ESQUEMA)) {
    return {
      ok: false,
      pendientes: 0,
      procesados: 0,
      conflictos: 0,
      mensaje: `No se encontró el esquema de Neon en ${RUTA_ESQUEMA}.`,
    };
  }

  const pendientes = obtenerPendientes();
  const eliminacionesPendientes = listarEliminacionesNeon().length;

  if (!pendientes.length && !eliminacionesPendientes) {
    return {
      ok: true,
      pendientes: 0,
      procesados: 0,
      conflictos: 0,
      mensaje: 'No hay viviendas ni eliminaciones pendientes de sincronización.',
    };
  }

  const cliente = new Client({
    connectionString: cadenaConexion,
    connectionTimeoutMillis: 8000,
  });
  let procesados = 0;
  let eliminacionesProcesadas = 0;

  try {
    await cliente.connect();

    const esquema = fs.readFileSync(RUTA_ESQUEMA, 'utf8');
    await cliente.query(esquema);

    eliminacionesProcesadas = await procesarEliminacionesNeon(cliente);

    for (let inicio = 0; inicio < pendientes.length; inicio += TAMANO_LOTE) {
      const lote = pendientes.slice(inicio, inicio + TAMANO_LOTE);

      await upsertRegistros(cliente, lote);

      for (const registro of lote) {
        marcarViviendaSincronizada(registro.id);
      }
      procesados += lote.length;
    }

    const partes: string[] = [];
    if (procesados) partes.push(`${procesados} vivienda(s) subida(s)`);
    if (eliminacionesProcesadas) {
      partes.push(`${eliminacionesProcesadas} eliminación(es) propagada(s)`);
    }

    return {
      ok: true,
      pendientes: pendientes.length,
      procesados,
      conflictos: 0,
      mensaje: `Sincronización completada: ${partes.join(' y ') || 'sin cambios'} en Neon.`,
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
