"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extraerDatos = extraerDatos;
exports.escanearPlanilla = escanearPlanilla;
exports.cerrarEscaneo = cerrarEscaneo;
const dotenv_1 = __importDefault(require("dotenv"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const tesseract_js_1 = __importDefault(require("tesseract.js"));
dotenv_1.default.config({ quiet: true });
const datosIdioma = require('@tesseract.js-data/spa');
let trabajadorPromesa = null;
let cola = Promise.resolve();
async function obtenerTrabajador() {
    if (!trabajadorPromesa) {
        trabajadorPromesa = tesseract_js_1.default.createWorker('spa', tesseract_js_1.default.OEM.LSTM_ONLY, {
            langPath: datosIdioma.langPath,
            gzip: datosIdioma.gzip,
            cachePath: path_1.default.join(os_1.default.tmpdir(), 'ssc200-ocr'),
        }).then(async (trabajador) => {
            await trabajador.setParameters({
                preserve_interword_spaces: '1',
                tessedit_pageseg_mode: tesseract_js_1.default.PSM.AUTO,
            });
            return trabajador;
        });
        trabajadorPromesa.catch(() => {
            trabajadorPromesa = null;
        });
    }
    return trabajadorPromesa;
}
function limpiarBase64(valor) {
    const coincidencia = /^data:[^;]+;base64,(.*)$/s.exec(valor.trim());
    return (coincidencia ? coincidencia[1] : valor.trim()).replace(/\s+/g, '');
}
function sinAcentos(valor) {
    return valor
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
}
function esLineaDeEtiqueta(linea) {
    const normal = sinAcentos(linea);
    if (!normal)
        return true;
    if (/^[A-ZÁÉÍÓÚÑ /.]{3,40}:$/.test(linea.trim()))
        return true;
    return [
        'NOMBRES',
        'APELLIDOS',
        'CEDULA',
        'C.I.',
        'CI',
        'FECHA DE NACIMIENTO',
        'F. NACIMIENTO',
        'NACIMIENTO',
        'EDAD',
        'SEXO',
        'TELEFONO',
        'TELEFONO MOVIL',
        'TELEFONO HABITACION',
        'CORREO',
        'ESTADO CIVIL',
        'NIVEL DE INSTRUCCION',
        'NIVEL INSTRUCCION',
        'PROFESION',
        'OCUPACION',
        'TRABAJA ACTUALMENTE',
        'TRABAJA',
        'CLASIFICACION DE INGRESOS',
        'INGRESO MENSUAL',
        'INGRESO',
        'DIRECCION',
        'COMUNIDAD',
        'SECTOR',
        'PARROQUIA',
        'MUNICIPIO',
        'ESTADO',
        'NUMERO DE CASA',
        'N DE CASA',
    ].includes(normal);
}
function valorDeEtiqueta(lineas, etiquetas) {
    for (let i = 0; i < lineas.length; i += 1) {
        const original = lineas[i];
        const normal = sinAcentos(original);
        for (const etiqueta of etiquetas) {
            const buscada = sinAcentos(etiqueta);
            if (normal === buscada) {
                const siguiente = lineas[i + 1];
                if (siguiente && !esLineaDeEtiqueta(siguiente))
                    return siguiente.trim();
                continue;
            }
            if (normal.startsWith(buscada)) {
                const resto = original
                    .slice(etiqueta.length)
                    .replace(/^[\s:.\-]+/, '')
                    .trim();
                if (resto)
                    return resto;
                const siguiente = lineas[i + 1];
                if (siguiente && !esLineaDeEtiqueta(siguiente))
                    return siguiente.trim();
            }
        }
    }
    return '';
}
function extraerFecha(valor) {
    const coincidencia = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(valor);
    if (coincidencia) {
        let [, dia, mes, anio] = coincidencia;
        let numeroAnio = Number(anio);
        if (anio.length === 2) {
            const actual = new Date().getFullYear() % 100;
            numeroAnio = numeroAnio <= actual ? 2000 + numeroAnio : 1900 + numeroAnio;
        }
        const d = Number(dia);
        const m = Number(mes);
        if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && numeroAnio >= 1900 && numeroAnio <= 2100) {
            return `${numeroAnio}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
    }
    const iso = /(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/.exec(valor);
    if (iso) {
        const [, anio, mes, dia] = iso;
        return `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    }
    const anioSuelto = /\b(19\d{2}|20\d{2})\b/.exec(valor);
    if (anioSuelto)
        return anioSuelto[1];
    return '';
}
function numeroDesdeTexto(valor) {
    const coincidencia = /(\d[\d.,]*)/.exec(valor);
    if (!coincidencia)
        return 0;
    let numero = coincidencia[1];
    const ultimaComa = numero.lastIndexOf(',');
    const ultimoPunto = numero.lastIndexOf('.');
    const separador = Math.max(ultimaComa, ultimoPunto);
    if (separador >= 0) {
        const decimales = numero.length - separador - 1;
        if (decimales === 3 && separador > 0) {
            numero = numero.replace(/[.,]/g, '');
        }
        else {
            numero = numero.replace(/\./g, '').replace(',', '.');
        }
    }
    const parsed = Number(numero);
    return Number.isFinite(parsed) ? parsed : 0;
}
function normalizarTelefono(prefijo, resto) {
    return `0${prefijo}-${resto}`;
}
function extraerTelefonos(texto) {
    let movil = '';
    let habitacion = '';
    const normalizado = texto.replace(/[^\d\s\-().]/g, ' ');
    const moviles = normalizado.match(/\b(04\d{2})[\s\-.]?(\d{7})\b/g) || [];
    const primerMovil = moviles[0];
    if (primerMovil) {
        const partes = /(\d{4})[\s\-.]?(\d{7})/.exec(primerMovil);
        if (partes?.[1] && partes[2]) {
            movil = normalizarTelefono(String(partes[1]).slice(1), String(partes[2]));
        }
    }
    const fijos = normalizado.match(/\b(02\d{2})[\s\-.]?(\d{7})\b/g) || [];
    const primerFijo = fijos[0];
    if (primerFijo) {
        const partes = /(\d{4})[\s\-.]?(\d{7})/.exec(primerFijo);
        if (partes?.[1] && partes[2]) {
            habitacion = normalizarTelefono(String(partes[1]).slice(1), String(partes[2]));
        }
    }
    return { movil, habitacion };
}
function extraerCedula(lineas, texto) {
    const valorEtiqueta = valorDeEtiqueta(lineas, ['CEDULA DE IDENTIDAD', 'CEDULA', 'C.I.', 'CI']);
    const candidatos = [valorEtiqueta, texto];
    for (const candidato of candidatos) {
        if (!candidato)
            continue;
        const conLetra = /\b([VE])[\s\-.]?(\d{6,9})\b/i.exec(candidato);
        if (conLetra) {
            return { tipo: conLetra[1].toUpperCase(), numero: conLetra[2] };
        }
        if (candidato === valorEtiqueta) {
            const soloNumeros = /^\D*(\d{6,9})\D*$/.exec(candidato);
            if (soloNumeros)
                return { tipo: 'V', numero: soloNumeros[1] };
        }
    }
    return { tipo: '', numero: '' };
}
function clasificarSexo(valor, permitirLetra = false) {
    const normal = sinAcentos(valor);
    if (!normal)
        return '';
    if (/\b(FEMENINO|MUJER)\b/.test(normal))
        return 'F';
    if (/\b(MASCULINO|HOMBRE)\b/.test(normal))
        return 'M';
    if (permitirLetra && /^F\b/.test(normal))
        return 'F';
    if (permitirLetra && /^M\b/.test(normal))
        return 'M';
    return '';
}
function normalizarEstadoCivil(texto) {
    const normal = sinAcentos(texto);
    const mapa = [
        [/\bCONCUBIN\w*/, 'Concubino/a'],
        [/\bCASAD\w*/, 'Casado/a'],
        [/\bDIVORCIAD\w*/, 'Divorciado/a'],
        [/\bVIUD\w*/, 'Viudo/a'],
        [/\bSOLTER\w*/, 'Soltero/a'],
    ];
    for (const [patron, valor] of mapa) {
        if (patron.test(normal))
            return valor;
    }
    return '';
}
function normalizarInstruccion(texto) {
    const normal = sinAcentos(texto);
    if (/\bPOSGRADO\b|\bPOSTGRADO\b/.test(normal))
        return 'Posgrado';
    if (/\bUNIVERSITARI\w*/.test(normal))
        return 'Universitario';
    if (/\bTECNIC\w*/.test(normal))
        return 'Técnico';
    if (/\bBACHILLER\w*|\bSECUNDARI\w*/.test(normal))
        return 'Bachillerato';
    if (/\bPRIMARI\w*/.test(normal))
        return 'Primaria';
    return '';
}
function normalizarClasificacion(texto) {
    const normal = sinAcentos(texto);
    if (/\bDIARI\w*/.test(normal))
        return 'Diario';
    if (/\bSEMANAL\b/.test(normal))
        return 'Semanal';
    if (/\bQUINCENAL\b/.test(normal))
        return 'Quincenal';
    if (/\bMENSUAL\b/.test(normal))
        return 'Mensual';
    if (/\bINFORMAL\b|\bINDEPENDIENTE\b/.test(normal)) {
        return 'Por Trabajo Independiente/Informal';
    }
    return '';
}
function extraerTrabaja(texto) {
    const normal = sinAcentos(texto);
    if (/\bNO\s+TRABAJA\b/.test(normal))
        return false;
    if (/\bTRABAJA\s*(?:ACTUALMENTE)?\s*:?\s*NO\b/.test(normal))
        return false;
    if (/\bTRABAJA\s*(?:ACTUALMENTE)?\s*:?\s*SI\b/.test(normal))
        return true;
    return null;
}
function extraerAnexo(texto) {
    const coincidencia = /\bANEXO\b[\s:.\-]*(?:N[°º]?\.?\s*)?([A-Z0-9][A-Z0-9\-]{0,9})?/i.exec(texto);
    if (!coincidencia)
        return { esAnexo: false, numero: '' };
    const etiqueta = (coincidencia[1] || '').toUpperCase();
    if (!etiqueta || ['DE', 'DEL', 'LA', 'EL'].includes(etiqueta)) {
        return { esAnexo: true, numero: '' };
    }
    return { esAnexo: true, numero: `Anexo ${etiqueta}` };
}
function extraerDatos(textoOCR) {
    const texto = textoOCR.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
    const lineas = texto
        .split(/\r?\n/)
        .map((linea) => linea.trim())
        .filter(Boolean);
    const cedula = extraerCedula(lineas, texto);
    const telefonos = extraerTelefonos(texto);
    const nombres = valorDeEtiqueta(lineas, ['NOMBRES Y APELLIDOS', 'NOMBRES', 'NOMBRE']) || '';
    const apellidos = valorDeEtiqueta(lineas, ['APELLIDOS', 'APELLIDO']) || '';
    const fechaValor = valorDeEtiqueta(lineas, [
        'FECHA DE NACIMIENTO',
        'F. NACIMIENTO',
        'FECHA NACIMIENTO',
        'NACIMIENTO',
    ]);
    const fechaNacimiento = extraerFecha(fechaValor);
    const edadValor = valorDeEtiqueta(lineas, ['EDAD']);
    const edad = Math.min(120, Math.max(0, Math.trunc(numeroDesdeTexto(edadValor))));
    const sexoValor = valorDeEtiqueta(lineas, ['SEXO']);
    const sexo = clasificarSexo(sexoValor, true) || clasificarSexo(texto);
    const correo = (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(texto) || [''])[0].toLowerCase();
    const estadoCivil = normalizarEstadoCivil(texto);
    const instruccion = normalizarInstruccion(texto);
    const profesion = valorDeEtiqueta(lineas, ['PROFESION', 'OCUPACION', 'OFICIO']);
    const clasificacion = normalizarClasificacion(texto);
    const ingresoValor = valorDeEtiqueta(lineas, [
        'INGRESO MENSUAL BS',
        'INGRESO MENSUAL',
        'INGRESO',
    ]);
    const ingreso = numeroDesdeTexto(ingresoValor);
    const comunidad = valorDeEtiqueta(lineas, [
        'NOMBRE DE LA COMUNIDAD',
        'COMUNIDAD',
        'SECTOR',
    ]);
    const sector = valorDeEtiqueta(lineas, ['SECTOR']);
    const direccion = valorDeEtiqueta(lineas, ['DIRECCION EXACTA', 'DIRECCION']);
    const numeroCasa = valorDeEtiqueta(lineas, [
        'NUMERO DE CASA',
        'NRO DE CASA',
        'N DE CASA',
        'CASA N',
    ]);
    const consejo = valorDeEtiqueta(lineas, ['CONSEJO COMUNAL']);
    const anexo = extraerAnexo(texto);
    const trabajaValor = valorDeEtiqueta(lineas, ['TRABAJA ACTUALMENTE', 'TRABAJA']);
    const trabajaNormal = sinAcentos(trabajaValor);
    const trabajaActual = /^SI\b/.test(trabajaNormal)
        ? true
        : /^NO\b/.test(trabajaNormal)
            ? false
            : extraerTrabaja(texto);
    return {
        ubicacion: {
            estado: valorDeEtiqueta(lineas, ['ESTADO']),
            municipio: valorDeEtiqueta(lineas, ['MUNICIPIO']),
            parroquia: valorDeEtiqueta(lineas, ['PARROQUIA']),
            sector,
            nombre_comunidad: comunidad || sector,
            direccion: direccion || [comunidad, sector, numeroCasa].filter(Boolean).join(', ').trim(),
            consejo_comunal_detectado: consejo,
            es_anexo: anexo.esAnexo,
            numero_anexo: anexo.numero,
            numero_casa: numeroCasa,
        },
        jefe: {
            nombres,
            apellidos,
            nacionalidad: cedula.tipo || 'V',
            cedula: cedula.numero,
            fecha_nacimiento: fechaNacimiento,
            edad,
            sexo,
            telefono_movil: telefonos.movil,
            telefono_habitacion: telefonos.habitacion,
            correo,
            estado_civil: estadoCivil,
            nivel_instruccion: instruccion,
            profesion,
            trabaja_actual: trabajaActual,
            clasificacion_ingresos: clasificacion,
            ingreso_mensual_bs: ingreso,
        },
        grupo_familiar: [],
    };
}
async function escanearPlanilla({ imagen, }) {
    const datos = limpiarBase64(imagen);
    if (!datos)
        throw new Error('La imagen recibida está vacía.');
    const buffer = Buffer.from(datos, 'base64');
    if (!buffer.length)
        throw new Error('La imagen recibida está vacía.');
    if (buffer.length > 12 * 1024 * 1024) {
        throw new Error('La imagen supera el tamaño máximo permitido (12 MB).');
    }
    const firma = buffer.subarray(0, 4).toString('hex');
    const esImagen = firma.startsWith('ffd8') || firma === '89504e47' || buffer.subarray(0, 4).toString() === 'RIFF';
    if (!esImagen)
        throw new Error('El archivo recibido no es una imagen válida.');
    const tarea = cola.then(async () => {
        const trabajador = await obtenerTrabajador();
        const { data } = await trabajador.recognize(buffer);
        const texto = (data.text || '').trim();
        return {
            texto,
            confianza: Math.round(Number(data.confidence) || 0),
            datos: extraerDatos(texto),
        };
    });
    cola = tarea.then(() => undefined, () => undefined);
    return tarea;
}
async function cerrarEscaneo() {
    if (!trabajadorPromesa)
        return;
    const trabajador = await trabajadorPromesa.catch(() => null);
    trabajadorPromesa = null;
    await trabajador?.terminate();
}
//# sourceMappingURL=escaneo.js.map