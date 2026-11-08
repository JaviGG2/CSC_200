"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.construirRegistroNeon = construirRegistroNeon;
exports.eliminarRegistroEnNeon = eliminarRegistroEnNeon;
exports.actualizarViviendaEnNeon = actualizarViviendaEnNeon;
exports.sincronizarConNeon = sincronizarConNeon;
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pg_1 = require("pg");
const db_1 = require("./db");
dotenv_1.default.config({ quiet: true });
const TAMANO_LOTE = 100;
const RUTA_ESQUEMA = path_1.default.join(process.cwd(), 'sql', 'neon_schema.sql');
function detalleError(error) {
    return error instanceof Error ? error.message : String(error);
}
function crearClienteNeon() {
    const cadenaConexion = process.env.DATABASE_URL;
    if (!cadenaConexion)
        return null;
    return new pg_1.Client({
        connectionString: cadenaConexion,
        connectionTimeoutMillis: 8000,
    });
}
function construirRegistroNeon(viviendaId) {
    const vivienda = db_1.db
        .prepare(`
      SELECT id, comunidad, etapa, manzana, direccion, numero_casa, fecha_registro
      FROM viviendas
      WHERE id = ?
    `)
        .get(viviendaId);
    if (!vivienda)
        return null;
    const jefe = (0, db_1.obtenerJefePorVivienda)(viviendaId);
    if (!jefe)
        return null;
    const integrantes = (0, db_1.obtenerIntegrantesPorVivienda)(viviendaId);
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
                cedula: integrante.cedula_tipo && integrante.cedula_numero
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
function obtenerPendientes() {
    const filas = db_1.db
        .prepare(`
      SELECT id
      FROM viviendas
      WHERE sincronizado = 0
        AND sincronizar_neon = 1
      ORDER BY id
    `)
        .all();
    const pendientes = [];
    for (const fila of filas) {
        const registro = construirRegistroNeon(fila.id);
        if (registro)
            pendientes.push(registro);
    }
    return pendientes;
}
function prepararUpsert(registros) {
    const valores = [];
    const filas = registros.map((registro, indice) => {
        const base = indice * 6;
        valores.push(registro.cedula, registro.nombres, registro.apellidos, registro.fecha_nacimiento ?? registro.fecha_registro, JSON.stringify(registro.datos_extras), registro.comunidad);
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
async function upsertRegistros(cliente, registros) {
    if (!registros.length)
        return 0;
    const { texto, valores } = prepararUpsert(registros);
    await cliente.query('BEGIN');
    try {
        const resultado = await cliente.query(texto, valores);
        await cliente.query('COMMIT');
        return resultado.rowCount ?? registros.length;
    }
    catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    }
}
async function procesarEliminacionesNeon(cliente) {
    const pendientes = (0, db_1.listarEliminacionesNeon)();
    let procesadas = 0;
    for (const eliminacion of pendientes) {
        await cliente.query('DELETE FROM registros_censo WHERE cedula = $1', [
            eliminacion.cedula,
        ]);
        (0, db_1.eliminarEliminacionNeon)(eliminacion.id);
        procesadas += 1;
    }
    return procesadas;
}
// Elimina de Neon el registro de una vivienda identificado por la cédula del jefe.
async function eliminarRegistroEnNeon(cedula) {
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
        const resultado = await cliente.query('DELETE FROM registros_censo WHERE cedula = $1', [cedula]);
        const eliminados = resultado.rowCount ?? 0;
        return {
            ok: true,
            configurado: true,
            aplicado: eliminados > 0,
            mensaje: eliminados > 0
                ? 'Registro eliminado de Neon.'
                : 'No había un registro de esta vivienda en Neon.',
        };
    }
    catch (error) {
        return {
            ok: false,
            configurado: true,
            aplicado: false,
            mensaje: detalleError(error),
        };
    }
    finally {
        await cliente.end().catch(() => { });
    }
}
// Vuelve a subir la ficha completa de una vivienda (por ejemplo, tras borrar un integrante).
async function actualizarViviendaEnNeon(viviendaId) {
    const vivienda = db_1.db
        .prepare('SELECT sincronizado, sincronizar_neon FROM viviendas WHERE id = ?')
        .get(viviendaId);
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
        (0, db_1.marcarViviendaSincronizada)(viviendaId);
        return {
            ok: true,
            configurado: true,
            aplicado: true,
            mensaje: 'Ficha de la vivienda actualizada en Neon.',
        };
    }
    catch (error) {
        return {
            ok: false,
            configurado: true,
            aplicado: false,
            mensaje: detalleError(error),
        };
    }
    finally {
        await cliente.end().catch(() => { });
    }
}
async function sincronizarConNeon() {
    const cadenaConexion = process.env.DATABASE_URL;
    if (!cadenaConexion) {
        return {
            ok: false,
            pendientes: 0,
            procesados: 0,
            conflictos: 0,
            mensaje: 'Defina DATABASE_URL en el archivo .env con la cadena de conexión de Neon (sslmode=require).',
        };
    }
    if (!fs_1.default.existsSync(RUTA_ESQUEMA)) {
        return {
            ok: false,
            pendientes: 0,
            procesados: 0,
            conflictos: 0,
            mensaje: `No se encontró el esquema de Neon en ${RUTA_ESQUEMA}.`,
        };
    }
    const pendientes = obtenerPendientes();
    const eliminacionesPendientes = (0, db_1.listarEliminacionesNeon)().length;
    if (!pendientes.length && !eliminacionesPendientes) {
        return {
            ok: true,
            pendientes: 0,
            procesados: 0,
            conflictos: 0,
            mensaje: 'No hay viviendas ni eliminaciones pendientes de sincronización.',
        };
    }
    const cliente = new pg_1.Client({
        connectionString: cadenaConexion,
        connectionTimeoutMillis: 8000,
    });
    let procesados = 0;
    let eliminacionesProcesadas = 0;
    try {
        await cliente.connect();
        const esquema = fs_1.default.readFileSync(RUTA_ESQUEMA, 'utf8');
        await cliente.query(esquema);
        eliminacionesProcesadas = await procesarEliminacionesNeon(cliente);
        for (let inicio = 0; inicio < pendientes.length; inicio += TAMANO_LOTE) {
            const lote = pendientes.slice(inicio, inicio + TAMANO_LOTE);
            await upsertRegistros(cliente, lote);
            for (const registro of lote) {
                (0, db_1.marcarViviendaSincronizada)(registro.id);
            }
            procesados += lote.length;
        }
        const partes = [];
        if (procesados)
            partes.push(`${procesados} vivienda(s) subida(s)`);
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
    }
    finally {
        await cliente.end().catch(() => { });
    }
}
async function main() {
    try {
        const resultado = await sincronizarConNeon();
        console.log(resultado.mensaje);
        if (!resultado.ok)
            process.exitCode = 1;
    }
    catch (error) {
        console.error('No se pudo completar la sincronización:', error.message);
        process.exitCode = 1;
    }
}
if (require.main === module) {
    main();
}
//# sourceMappingURL=sincronizar.js.map