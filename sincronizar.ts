import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import {
  db,
  obtenerJefePorVivienda,
  obtenerIntegrantesPorVivienda,
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

type ViviendaPendiente = {
  id: number;
  comunidad: string;
  etapa: string | null;
  manzana: string | null;
  direccion: string;
  numero_casa: string | null;
  fecha_registro: string;
  cedula: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string | null;
  datos_extras: Record<string, unknown>;
};

function obtenerPendientes(): ViviendaPendiente[] {
  const viviendas = db
    .prepare(`
      SELECT v.id, v.comunidad, v.etapa, v.manzana, v.direccion,
             v.numero_casa, v.fecha_registro
      FROM viviendas v
      WHERE v.sincronizado = 0
        AND v.sincronizar_neon = 1
      ORDER BY v.id
    `)
    .all() as Array<{
      id: number;
      comunidad: string;
      etapa: string | null;
      manzana: string | null;
      direccion: string;
      numero_casa: string | null;
      fecha_registro: string;
    }>;

  const resultado: ViviendaPendiente[] = [];

  for (const v of viviendas) {
    const jefe = obtenerJefePorVivienda(v.id);
    if (!jefe) continue;

    const integrantes = obtenerIntegrantesPorVivienda(v.id);

    resultado.push({
      id: v.id,
      comunidad: v.comunidad,
      etapa: v.etapa,
      manzana: v.manzana,
      direccion: v.direccion,
      numero_casa: v.numero_casa,
      fecha_registro: v.fecha_registro,
      cedula: `${jefe.cedula_tipo}-${jefe.cedula_numero}`,
      nombres: jefe.nombres,
      apellidos: jefe.apellidos,
      fecha_nacimiento: jefe.fecha_nacimiento,
      datos_extras: {
        comunidad: v.comunidad,
        etapa: v.etapa,
        manzana: v.manzana,
        direccion: v.direccion,
        numero_casa: v.numero_casa,
        fecha_registro_vivienda: v.fecha_registro,
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
        integrantes: integrantes.map((i) => ({
          numero: i.numero,
          apellidos: i.apellidos,
          nombres: i.nombres,
          cedula:
            i.cedula_tipo && i.cedula_numero
              ? `${i.cedula_tipo}-${i.cedula_numero}`
              : null,
          fecha_nacimiento: i.fecha_nacimiento,
          sexo: i.sexo,
          parentesco: i.parentesco,
          nivel_instruccion: i.nivel_instruccion,
          profesion: i.profesion,
        })),
      },
    });
  }

  return resultado;
}

const actualizarViviendaSincronizada = db.prepare(`
  UPDATE viviendas
  SET sincronizado = 1,
      sincronizado_en = datetime('now', 'localtime')
  WHERE id = ?
`);

const marcarLote = db.transaction((ids: number[]) => {
  for (const id of ids) {
    actualizarViviendaSincronizada.run(id);
  }
});

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

  if (!pendientes.length) {
    return {
      ok: true,
      pendientes: 0,
      procesados: 0,
      conflictos: 0,
      mensaje: 'No hay viviendas pendientes de sincronización.',
    };
  }

  const cliente = new Client({ connectionString: cadenaConexion });
  let procesados = 0;

  try {
    await cliente.connect();

    const esquema = fs.readFileSync(RUTA_ESQUEMA, 'utf8');
    await cliente.query(esquema);

    for (let inicio = 0; inicio < pendientes.length; inicio += TAMANO_LOTE) {
      const lote = pendientes.slice(inicio, inicio + TAMANO_LOTE);

      const valores: unknown[] = [];
      const filas = lote.map((registro, indice) => {
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

      await cliente.query('BEGIN');
      try {
        await cliente.query(texto, valores);
        await cliente.query('COMMIT');
      } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
      }

      marcarLote(lote.map((registro) => registro.id));
      procesados += lote.length;
    }

    return {
      ok: true,
      pendientes: pendientes.length,
      procesados,
      conflictos: 0,
      mensaje: `Sincronización completada: ${procesados} vivienda(s) subida(s) a Neon.`,
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
