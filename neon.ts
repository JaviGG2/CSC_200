import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import {
  db,
  obtenerConsejoComunalPorId,
  marcarViviendaSincronizada,
} from './db';

dotenv.config({ quiet: true });

const RUTA_ESQUEMA = path.join(process.cwd(), 'sql', 'neon_schema.sql');

let esquemaListo = false;

export type ResultadoEsquemaNeon = {
  ok: boolean;
  configurado: boolean;
  mensaje: string;
};

export type ResultadoGuardadoNeon = {
  ok: boolean;
  configurado: boolean;
  aplicado: boolean;
  mensaje: string;
};

type ViviendaLocal = {
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
  es_anexo: number;
  numero_anexo: string | null;
  vivienda_principal_id: number | null;
  fecha_registro: string;
  sincronizar_neon: number;
  neon_id?: number | null;
};

type JefeLocal = {
  cedula_tipo: string;
  cedula_numero: string | null;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  edad: number | null;
  sexo: string;
  telefono_movil: string | null;
  telefono_habitacion: string | null;
  telefono_trabajo: string | null;
  correo: string | null;
  nivel_instruccion: string;
  estado_civil: string;
  profesion: string | null;
  trabaja_actual: string;
  clasificacion_ingresos: string;
  frecuencia_ingresos: string | null;
  ingreso_mensual_bs: number | null;
};

type IntegranteLocal = {
  numero: number;
  apellidos: string;
  nombres: string;
  cedula_tipo: string | null;
  cedula_numero: string | null;
  fecha_nacimiento: string | null;
  edad: number | null;
  sexo: string | null;
  parentesco: string;
  nivel_instruccion: string | null;
  profesion: string | null;
  ingreso_mensual: number | null;
};

function detalleError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// PostgreSQL rechaza cadenas vacías en DATE/NUMERIC, así que se convierten en NULL.
function textoONulo(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const limpio = String(valor).trim();
  return limpio === '' ? null : limpio;
}

function numeroONulo(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function fechaNeonValida(
  valor: string | null | undefined,
  respaldo?: string | null
): string {
  const limpio = textoONulo(valor);
  if (limpio && /^\d{4}-\d{2}-\d{2}/.test(limpio)) return limpio.slice(0, 10);
  const alt = textoONulo(respaldo);
  if (alt && /^\d{4}-\d{2}-\d{2}/.test(alt)) return alt.slice(0, 10);
  return '1900-01-01';
}

function esCadenaNeonValida(cadena: string): boolean {
  const limpia = cadena.trim();
  if (!limpia) return false;
  try {
    const parsed = new URL(limpia);
    const user = decodeURIComponent(parsed.username || '').toLowerCase();
    const host = (parsed.hostname || '').toLowerCase();
    if (!host || user === 'usuario' || user === 'user' || host === 'host' || host === 'example.com') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function crearClienteNeon(): Client | null {
  const cadenaConexion = process.env.DATABASE_URL;
  if (!cadenaConexion || !esCadenaNeonValida(cadenaConexion)) return null;

  return new Client({
    connectionString: cadenaConexion,
    connectionTimeoutMillis: 8000,
  });
}

function cedulaNeonJefe(viviendaId: number, jefe: JefeLocal): string {
  return (jefe.cedula_tipo === 'V' || jefe.cedula_tipo === 'E') && jefe.cedula_numero
    ? `${jefe.cedula_tipo}-${jefe.cedula_numero}`
    : `S-${viviendaId}`;
}

function leerViviendaLocal(viviendaId: number): {
  vivienda: ViviendaLocal;
  jefe: JefeLocal;
  integrantes: IntegranteLocal[];
} | null {
  const vivienda = db
    .prepare('SELECT * FROM viviendas WHERE id = ?')
    .get(viviendaId) as ViviendaLocal | undefined;
  if (!vivienda) return null;

  const jefe = db
    .prepare('SELECT * FROM jefes_familia WHERE vivienda_id = ?')
    .get(viviendaId) as JefeLocal | undefined;
  if (!jefe) return null;

  const integrantes = db
    .prepare(
      'SELECT * FROM integrantes_grupo_familiar WHERE vivienda_id = ? ORDER BY numero'
    )
    .all(viviendaId) as IntegranteLocal[];

  return { vivienda, jefe, integrantes };
}

// Ejecuta el esquema idempotente sobre una conexión ya abierta.
export async function aplicarEsquemaNeon(cliente: Client): Promise<void> {
  const esquema = fs.readFileSync(RUTA_ESQUEMA, 'utf8');
  await cliente.query(esquema);
}

export async function asegurarEsquema(cliente: Client): Promise<void> {
  if (esquemaListo) return;

  await aplicarEsquemaNeon(cliente);
  esquemaListo = true;
}

// Crea en Neon todas las tablas del sistema. Se llama al arrancar el servidor
// y también desde `npm run neon:init`.
export async function inicializarEsquemaNeon(): Promise<ResultadoEsquemaNeon> {
  const cliente = crearClienteNeon();

  if (!cliente) {
    return {
      ok: false,
      configurado: false,
      mensaje: 'DATABASE_URL no está configurada; no se pudo crear el esquema en Neon.',
    };
  }

  try {
    await cliente.connect();
    await aplicarEsquemaNeon(cliente);
    esquemaListo = true;
    return {
      ok: true,
      configurado: true,
      mensaje: 'Esquema de Neon verificado: todas las tablas necesarias existen.',
    };
  } catch (error) {
    return {
      ok: false,
      configurado: true,
      mensaje: `No se pudo crear el esquema en Neon: ${detalleError(error)}`,
    };
  } finally {
    await cliente.end().catch(() => {});
  }
}

async function resolverConsejo(
  cliente: Client,
  vivienda: ViviendaLocal
): Promise<number | null> {
  if (!vivienda.consejo_comunal_id) return null;

  const consejo = obtenerConsejoComunalPorId(vivienda.consejo_comunal_id);
  if (!consejo) return null;

  const existente = await cliente.query(
    'SELECT id FROM consejos_comunales WHERE lower(nombre) = lower($1) LIMIT 1',
    [consejo.nombre]
  );
  if (existente.rowCount) return Number(existente.rows[0].id);

  const creado = await cliente.query(
    `
      INSERT INTO consejos_comunales (nombre, sector, activo)
      VALUES ($1, $2, true)
      RETURNING id
    `,
    [consejo.nombre, consejo.sector]
  );
  return Number(creado.rows[0].id);
}

async function resolverViviendaPrincipal(
  cliente: Client,
  vivienda: ViviendaLocal
): Promise<number | null> {
  if (!vivienda.vivienda_principal_id) return null;

  const localPrincipal = db
    .prepare('SELECT id, neon_id FROM viviendas WHERE id = ?')
    .get(vivienda.vivienda_principal_id) as { id: number; neon_id: number | null } | undefined;

  if (localPrincipal?.neon_id) {
    const porNeonId = await cliente.query(
      'SELECT id FROM viviendas WHERE id = $1 LIMIT 1',
      [localPrincipal.neon_id]
    );
    if (porNeonId.rowCount) return Number(porNeonId.rows[0].id);
  }

  const fila = await cliente.query(
    `SELECT id FROM viviendas WHERE origen = 'local' AND origen_id = $1 LIMIT 1`,
    [vivienda.vivienda_principal_id]
  );
  return fila.rowCount ? Number(fila.rows[0].id) : null;
}

// Inserta/actualiza una vivienda completa usando la transacción abierta por el
// llamador. Se reutiliza tanto en el guardado directo como en la sincronización.
export async function guardarViviendaConCliente(
  cliente: Client,
  viviendaId: number
): Promise<{ viviendaNeonId: number; jefeNeonId: number }> {
  const local = leerViviendaLocal(viviendaId);
  if (!local) throw new Error('La vivienda local no existe o no tiene jefe de familia.');

  const { vivienda, jefe, integrantes } = local;
  const consejoId = await resolverConsejo(cliente, vivienda);
  const principalId = await resolverViviendaPrincipal(cliente, vivienda);

  let viviendaNeonId: number | null = null;
  if (vivienda.neon_id) {
    const existente = await cliente.query(
      'SELECT id FROM viviendas WHERE id = $1 LIMIT 1',
      [vivienda.neon_id]
    );
    if (existente.rowCount) {
      const actualizada = await cliente.query(
        `
          UPDATE viviendas SET
            estado = $2,
            municipio = $3,
            parroquia = $4,
            comunidad = $5,
            etapa = $6,
            manzana = $7,
            direccion = $8,
            numero_casa = $9,
            consejo_comunal_id = $10,
            es_anexo = $11,
            numero_anexo = $12,
            vivienda_principal_id = $13,
            updated_at = now()
          WHERE id = $1
          RETURNING id
        `,
        [
          vivienda.neon_id,
          vivienda.estado,
          vivienda.municipio,
          vivienda.parroquia,
          vivienda.comunidad,
          textoONulo(vivienda.etapa),
          textoONulo(vivienda.manzana),
          vivienda.direccion,
          textoONulo(vivienda.numero_casa),
          consejoId,
          Boolean(vivienda.es_anexo),
          textoONulo(vivienda.numero_anexo),
          principalId,
        ]
      );
      viviendaNeonId = Number(actualizada.rows[0].id);
    }
  }

  if (viviendaNeonId === null) {
    const viviendaGuardada = await cliente.query(
      `
        INSERT INTO viviendas
          (origen, origen_id, estado, municipio, parroquia, comunidad, etapa, manzana,
           direccion, numero_casa, consejo_comunal_id, es_anexo, numero_anexo,
           vivienda_principal_id, fecha_registro, updated_at)
        VALUES
          ('local', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
           COALESCE(($14)::timestamp AT TIME ZONE 'America/Caracas', now()), now())
        ON CONFLICT (origen, origen_id) DO UPDATE SET
          estado = EXCLUDED.estado,
          municipio = EXCLUDED.municipio,
          parroquia = EXCLUDED.parroquia,
          comunidad = EXCLUDED.comunidad,
          etapa = EXCLUDED.etapa,
          manzana = EXCLUDED.manzana,
          direccion = EXCLUDED.direccion,
          numero_casa = EXCLUDED.numero_casa,
          consejo_comunal_id = EXCLUDED.consejo_comunal_id,
          es_anexo = EXCLUDED.es_anexo,
          numero_anexo = EXCLUDED.numero_anexo,
          vivienda_principal_id = EXCLUDED.vivienda_principal_id,
          updated_at = now()
        RETURNING id
      `,
      [
        viviendaId,
        vivienda.estado,
        vivienda.municipio,
        vivienda.parroquia,
        vivienda.comunidad,
        textoONulo(vivienda.etapa),
        textoONulo(vivienda.manzana),
        vivienda.direccion,
        textoONulo(vivienda.numero_casa),
        consejoId,
        Boolean(vivienda.es_anexo),
        textoONulo(vivienda.numero_anexo),
        principalId,
        vivienda.fecha_registro,
      ]
    );
    viviendaNeonId = Number(viviendaGuardada.rows[0].id);
  }

  const jefeGuardado = await cliente.query(
    `
      INSERT INTO jefes_familia
        (vivienda_id, cedula_tipo, cedula_numero, nombres, apellidos, fecha_nacimiento,
         edad, sexo, telefono_movil, telefono_habitacion, telefono_trabajo, correo,
         nivel_instruccion, estado_civil, profesion, trabaja_actual,
         clasificacion_ingresos, frecuencia_ingresos, ingreso_mensual_bs, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, now())
      ON CONFLICT (vivienda_id) DO UPDATE SET
        cedula_tipo = EXCLUDED.cedula_tipo,
        cedula_numero = EXCLUDED.cedula_numero,
        nombres = EXCLUDED.nombres,
        apellidos = EXCLUDED.apellidos,
        fecha_nacimiento = EXCLUDED.fecha_nacimiento,
        edad = EXCLUDED.edad,
        sexo = EXCLUDED.sexo,
        telefono_movil = EXCLUDED.telefono_movil,
        telefono_habitacion = EXCLUDED.telefono_habitacion,
        telefono_trabajo = EXCLUDED.telefono_trabajo,
        correo = EXCLUDED.correo,
        nivel_instruccion = EXCLUDED.nivel_instruccion,
        estado_civil = EXCLUDED.estado_civil,
        profesion = EXCLUDED.profesion,
        trabaja_actual = EXCLUDED.trabaja_actual,
        clasificacion_ingresos = EXCLUDED.clasificacion_ingresos,
        frecuencia_ingresos = EXCLUDED.frecuencia_ingresos,
        ingreso_mensual_bs = EXCLUDED.ingreso_mensual_bs,
        updated_at = now()
      RETURNING id
    `,
    [
      viviendaNeonId,
      jefe.cedula_tipo,
      textoONulo(jefe.cedula_numero),
      jefe.nombres,
      jefe.apellidos,
      fechaNeonValida(jefe.fecha_nacimiento, vivienda.fecha_registro),
      numeroONulo(jefe.edad),
      jefe.sexo,
      textoONulo(jefe.telefono_movil),
      textoONulo(jefe.telefono_habitacion),
      textoONulo(jefe.telefono_trabajo),
      textoONulo(jefe.correo),
      jefe.nivel_instruccion,
      jefe.estado_civil,
      textoONulo(jefe.profesion),
      jefe.trabaja_actual === 'Sí',
      jefe.clasificacion_ingresos,
      textoONulo(jefe.frecuencia_ingresos),
      numeroONulo(jefe.ingreso_mensual_bs),
    ]
  );

  await cliente.query(
    'DELETE FROM integrantes_grupo_familiar WHERE vivienda_id = $1',
    [viviendaNeonId]
  );

  for (const integrante of integrantes) {
    await cliente.query(
      `
        INSERT INTO integrantes_grupo_familiar
          (vivienda_id, numero, apellidos, nombres, cedula_tipo, cedula_numero,
           fecha_nacimiento, edad, sexo, parentesco, nivel_instruccion, profesion, ingreso_mensual)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [
        viviendaNeonId,
        integrante.numero,
        integrante.apellidos,
        integrante.nombres,
        textoONulo(integrante.cedula_tipo),
        textoONulo(integrante.cedula_numero),
        textoONulo(integrante.fecha_nacimiento),
        numeroONulo(integrante.edad),
        textoONulo(integrante.sexo),
        integrante.parentesco,
        textoONulo(integrante.nivel_instruccion),
        textoONulo(integrante.profesion),
        numeroONulo(integrante.ingreso_mensual),
      ]
    );
  }

  const datosExtras = {
    comunidad: vivienda.comunidad,
    etapa: vivienda.etapa,
    manzana: vivienda.manzana,
    direccion: vivienda.direccion,
    numero_casa: vivienda.numero_casa,
    consejo_comunal_id: consejoId,
    es_anexo: Boolean(vivienda.es_anexo),
    numero_anexo: vivienda.numero_anexo,
    vivienda_principal_id: principalId,
    fecha_registro_vivienda: vivienda.fecha_registro,
    jefe: {
      cedula: cedulaNeonJefe(viviendaId, jefe),
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
      ingreso_mensual_bs: jefe.ingreso_mensual_bs,
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
      ingreso_mensual: integrante.ingreso_mensual,
    })),
  };

  await cliente.query(
    `
      INSERT INTO registros_censo
        (cedula, nombres, apellidos, fecha_nacimiento, datos_extras, sector)
      VALUES
        ($1, $2, $3, ($4)::timestamp AT TIME ZONE 'America/Caracas', $5::jsonb, $6)
      ON CONFLICT (cedula) DO UPDATE SET
        nombres = EXCLUDED.nombres,
        apellidos = EXCLUDED.apellidos,
        fecha_nacimiento = EXCLUDED.fecha_nacimiento,
        datos_extras = EXCLUDED.datos_extras,
        sector = EXCLUDED.sector
    `,
    [
      cedulaNeonJefe(viviendaId, jefe),
      jefe.nombres,
      jefe.apellidos,
      fechaNeonValida(jefe.fecha_nacimiento, vivienda.fecha_registro),
      JSON.stringify(datosExtras),
      vivienda.comunidad,
    ]
  );

  return {
    viviendaNeonId,
    jefeNeonId: Number(jefeGuardado.rows[0].id),
  };
}

// Guardado directo desde el formulario: una sola transacción atómica en Neon.
export async function guardarViviendaEnNeon(
  viviendaId: number
): Promise<ResultadoGuardadoNeon> {
  const cliente = crearClienteNeon();

  if (!cliente) {
    return {
      ok: true,
      configurado: false,
      aplicado: false,
      mensaje: 'DATABASE_URL no está configurada; la vivienda quedó solo en local.',
    };
  }

  try {
    await cliente.connect();
    await asegurarEsquema(cliente);
    await cliente.query('BEGIN');
    let viviendaNeonId: number | null = null;
    try {
      const guardado = await guardarViviendaConCliente(cliente, viviendaId);
      viviendaNeonId = guardado.viviendaNeonId;
      await cliente.query('COMMIT');
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    }

    marcarViviendaSincronizada(viviendaId, viviendaNeonId);

    return {
      ok: true,
      configurado: true,
      aplicado: true,
      mensaje: 'Vivienda guardada en Neon dentro de una transacción atómica.',
    };
  } catch (error) {
    return {
      ok: false,
      configurado: true,
      aplicado: false,
      mensaje: `No se pudo guardar en Neon: ${detalleError(error)}`,
    };
  } finally {
    await cliente.end().catch(() => {});
  }
}
