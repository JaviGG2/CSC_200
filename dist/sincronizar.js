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
const neon_1 = require("./neon");
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
// Clave en Neon del jefe de familia. Quien no tiene cédula recibe una clave
// estable por vivienda para no confundirlo con otra persona sin cédula.
function cedulaNeonJefe(viviendaId, tipo, numero) {
    return (tipo === 'V' || tipo === 'E') && numero ? `${tipo}-${numero}` : `S-${viviendaId}`;
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
// Clasifica TODAS las viviendas sin subir, para no perder ninguna en silencio:
// las que se pueden subir, las marcadas como "Solo local" y las que no tienen jefe.
function clasificarViviendasSinSubir() {
    const filas = db_1.db
        .prepare(`
      SELECT v.id, v.sincronizar_neon, j.id AS jefe_id
      FROM viviendas v
      LEFT JOIN jefes_familia j ON j.vivienda_id = v.id
      WHERE v.sincronizado = 0
      ORDER BY v.id
    `)
        .all();
    const resultado = {
        subibles: [],
        soloLocal: [],
        sinJefe: [],
    };
    for (const fila of filas) {
        if (!fila.sincronizar_neon) {
            resultado.soloLocal.push(fila.id);
        }
        else if (fila.jefe_id === null) {
            resultado.sinJefe.push(fila.id);
        }
        else {
            resultado.subibles.push(fila.id);
        }
    }
    return resultado;
}
function construirPendientes(ids) {
    const pendientes = [];
    for (const id of ids) {
        const registro = construirRegistroNeon(id);
        if (registro)
            pendientes.push(registro);
    }
    return pendientes;
}
function listarIds(ids, maximo = 10) {
    const visibles = ids.slice(0, maximo).map((id) => `N.º ${id}`);
    const restantes = ids.length - visibles.length;
    return restantes > 0 ? `${visibles.join(', ')} y ${restantes} más` : visibles.join(', ');
}
function describirOmitidas(soloLocal, sinJefe, fallidas) {
    const partes = [];
    if (sinJefe.length) {
        partes.push(`${sinJefe.length} vivienda(s) sin jefe de familia no se pudieron subir (${listarIds(sinJefe)})`);
    }
    if (soloLocal.length) {
        partes.push(`${soloLocal.length} vivienda(s) marcada(s) como «Solo local» no se suben a Neon (${listarIds(soloLocal)})`);
    }
    if (fallidas.length) {
        partes.push(`${fallidas.length} vivienda(s) fallaron al subir (${fallidas
            .slice(0, 5)
            .map((fallida) => `N.º ${fallida.id}: ${fallida.motivo}`)
            .join('; ')}${fallidas.length > 5 ? '; …' : ''})`);
    }
    return partes;
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
        for (const registro of registros) {
            await (0, neon_1.guardarViviendaConCliente)(cliente, registro.id);
        }
        await cliente.query('COMMIT');
        return resultado.rowCount ?? registros.length;
    }
    catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    }
}
// Si el lote falla completo (por ejemplo, por un dato inválido), reintenta
// registro por registro para aislar el error y no bloquear al resto.
async function subirLote(cliente, lote) {
    try {
        await upsertRegistros(cliente, lote);
        return { subidas: lote, fallidas: [] };
    }
    catch (errorLote) {
        if (lote.length === 1) {
            return { subidas: [], fallidas: [{ id: lote[0].id, motivo: detalleError(errorLote) }] };
        }
        const subidas = [];
        const fallidas = [];
        for (const registro of lote) {
            try {
                await upsertRegistros(cliente, [registro]);
                subidas.push(registro);
            }
            catch (error) {
                fallidas.push({ id: registro.id, motivo: detalleError(error) });
            }
        }
        return { subidas, fallidas };
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
            mensaje: 'Defina DATABASE_URL en el archivo .env con la cadena de conexión de Neon (sslmode=require).',
        };
    }
    if (!fs_1.default.existsSync(RUTA_ESQUEMA)) {
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
    const eliminacionesPendientes = (0, db_1.listarEliminacionesNeon)().length;
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
    const cliente = new pg_1.Client({
        connectionString: cadenaConexion,
        connectionTimeoutMillis: 8000,
    });
    let procesados = 0;
    let eliminacionesProcesadas = 0;
    const fallidas = [];
    try {
        await cliente.connect();
        await (0, neon_1.aplicarEsquemaNeon)(cliente);
        eliminacionesProcesadas = await procesarEliminacionesNeon(cliente);
        for (let inicio = 0; inicio < pendientes.length; inicio += TAMANO_LOTE) {
            const lote = pendientes.slice(inicio, inicio + TAMANO_LOTE);
            const resultado = await subirLote(cliente, lote);
            for (const registro of resultado.subidas) {
                (0, db_1.marcarViviendaSincronizada)(registro.id);
            }
            procesados += resultado.subidas.length;
            fallidas.push(...resultado.fallidas);
        }
        const partes = [];
        if (procesados)
            partes.push(`${procesados} vivienda(s) subida(s)`);
        if (eliminacionesProcesadas) {
            partes.push(`${eliminacionesProcesadas} eliminación(es) propagada(s)`);
        }
        const avisos = describirOmitidas(clasificacion.soloLocal, clasificacion.sinJefe, fallidas);
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
            mensaje: `Sincronización completada: ${resumen}.${avisos.length ? ` ${avisos.join('. ')}.` : ''}`,
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