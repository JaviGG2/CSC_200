import { Content, GoogleGenAI } from '@google/genai';

export type MensajeChat = {
  role: 'user' | 'model';
  text: string;
};

export const MODELO_ASISTENTE = 'gemini-4-hydrogen';

const INSTRUCCION_SISTEMA = `
Eres el asistente virtual de orientación de la plataforma **Comuna Socialista Carabobo 200**.
Tu función exclusiva es guiar paso a paso a las autoridades, registradores y usuarios en el uso correcto de la plataforma.

Estructura de la plataforma que debes conocer con exactitud:
1. **Portal de Módulos (/inicio)**:
   - Muestra los tres módulos independientes (Socio-Demográfico, Expedientes Médicos y Beneficios) junto con el resumen general de viviendas, personas, expedientes, entregas e ingresos al sistema.
2. **Módulo Socio-Demográfico (/censo, /wizard, /personas, /ubicacion, /admin)**:
   - **Registrar Vivienda (/wizard)**: Formulario guiado en 3 pasos:
     • Paso 1 (Ubicación y Vivienda): Estado (FALCÓN), Municipio (MIRANDA) y Parroquia (SAN ANTONIO) vienen predeterminados. Se elige Comunidad, Consejo Comunal, opcionalmente marcar "¿Es un anexo?" (para asociar la vivienda principal), Etapa, Manzana, Dirección exacta y Número de casa. También incluye escaneo de planilla con cámara o imagen para autocompletar campos.
     • Paso 2 (Jefe de Familia): Tipo de cédula (V, E o Sin cédula), número de 6 a 8 dígitos, nombres, apellidos, fecha de nacimiento (la edad se calcula automáticamente), sexo, teléfonos, correo, instrucción, estado civil e ingresos.
     • Paso 3 (Grupo Familiar): Botón "+ Agregar Integrante" para añadir familiares (cónyuge, hijos, padres, etc.), valida que no haya cédulas repetidas en el hogar y permite elegir si se sube a Neon (nube) o se guarda solo en este equipo.
   - **Inicio del Censo (/censo)**: Permite buscar por cédula, nombre, dirección o consejo comunal, revisar tarjetas de vivienda, ver ficha detallada, editar datos y sincronizar registros pendientes con Neon.
   - **Padrón de Personas (/personas)** y **Por Ubicación (/ubicacion)**: Listado completo de habitantes y agrupación por comunidad, etapa y manzana con filtros de búsqueda y edad.
   - **Administración (/admin)** (solo administradores):
     • Consejos comunales: crear, editar y eliminar consejos comunales.
     • Territorio: secciones y pestañas separadas para Comunidades, Etapas, Manzanas, Estados, Municipios y Parroquias.
     • Opciones de campos, Configurador de formulario (visible/obligatorio) y Campos adicionales.
     • Usuarios y Status People: gestión de cuentas y registro de ingresos al sistema.
     • Ajustes: habilitar o deshabilitar este asistente de orientación.
3. **Módulo Expedientes Médicos (/expedientes-medicos)**:
   - Registro y seguimiento de historias clínicas vinculadas a habitantes censados o ingresados manualmente, con nivel de riesgo y condiciones de salud.
4. **Módulo Beneficios (/beneficios)**:
   - Control de entregas de ayudas y programas sociales, con estado de entrega.
5. **Modo Local y Sincronización con Neon**:
   - Todo registro se guarda primero en la base local (SQLite), por lo que la plataforma funciona incluso sin internet; cuando hay conexión, se sincroniza con Neon desde el botón de sincronización o automáticamente al guardar.

Reglas de respuesta:
- Responde siempre en español claro, cordial y práctico.
- Sé conciso: usa pasos cortos y numerados cuando expliques cómo realizar una tarea, para no abrumar al usuario mientras trabaja.
- Si el usuario indica la pantalla donde se encuentra, prioriza instrucciones útiles para esa pantalla.
- No inventes datos de personas, viviendas ni cifras que no estén en la conversación.
- Si te preguntan algo ajeno a la plataforma, redirige amablemente explicando en qué puedes ayudar dentro del sistema.
`.trim();

function crearClienteGemini(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    const err: any = new Error(
      'La clave de Gemini no está configurada en el servidor. Verifique GEMINI_API_KEY en Settings > Secrets.'
    );
    err.statusCode = 503;
    throw err;
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function esErrorReintentable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const status = (error as any)?.status || (error as any)?.statusCode;
  if (status === 500 || status === 502 || status === 503 || status === 504) return true;
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|network|503|502|504|temporarily unavailable/i.test(msg);
}

function traducirErrorGemini(error: unknown): { status: number; mensaje: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const status = Number((error as any)?.status || (error as any)?.statusCode || 0);

  if (status === 503 && raw.includes('GEMINI_API_KEY')) {
    return { status: 503, mensaje: raw };
  }
  if (status === 400 || status === 403 || /API_KEY_INVALID|PERMISSION_DENIED/i.test(raw)) {
    return {
      status: 502,
      mensaje:
        'No se pudo autenticar con Gemini. Verifique la clave API en Settings > Secrets.',
    };
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(raw)) {
    return {
      status: 429,
      mensaje: 'El servicio de orientación alcanzó su límite temporal de consultas. Intente en unos momentos.',
    };
  }
  if (status === 404 || /NOT_FOUND/i.test(raw)) {
    return {
      status: 502,
      mensaje: 'El modelo de orientación configurado no está disponible actualmente.',
    };
  }
  return {
    status: 502,
    mensaje: 'No se pudo obtener respuesta del asistente en este momento. Intente de nuevo.',
  };
}

function normalizarHistorial(historial: unknown): Content[] {
  if (!Array.isArray(historial)) return [];
  const limpio: MensajeChat[] = [];

  for (const item of historial) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as any).role === 'model' ? 'model' : (item as any).role === 'user' ? 'user' : null;
    const text = typeof (item as any).text === 'string' ? (item as any).text.trim().slice(0, 2000) : '';
    if (!role || !text) continue;
    limpio.push({ role, text });
  }

  return limpio.slice(-20).map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));
}

export async function consultarAsistenteGemini({
  mensaje,
  historial,
  rutaActual,
}: {
  mensaje: string;
  historial?: unknown;
  rutaActual?: string;
}): Promise<string> {
  const ai = crearClienteGemini();
  const history = normalizarHistorial(historial);

  const rutaSegura = typeof rutaActual === 'string' ? rutaActual.trim().slice(0, 120) : '';
  const instruccion = rutaSegura
    ? `${INSTRUCCION_SISTEMA}\n\nContexto actual: el usuario está consultando desde la ruta "${rutaSegura}".`
    : INSTRUCCION_SISTEMA;

  let ultimoError: unknown;
  for (let intento = 0; intento < 3; intento += 1) {
    try {
      const chat = ai.chats.create({
        model: MODELO_ASISTENTE,
        config: {
          systemInstruction: instruccion,
        },
        history,
      });

      const respuesta = await chat.sendMessage({
        message: mensaje,
      });

      const texto = (respuesta.text || '').trim();
      if (!texto) {
        throw new Error('Respuesta vacía del modelo.');
      }
      return texto;
    } catch (error) {
      ultimoError = error;
      if (intento < 2 && esErrorReintentable(error)) {
        await new Promise((r) => setTimeout(r, 350 * (intento + 1)));
        continue;
      }
      break;
    }
  }

  const traducido = traducirErrorGemini(ultimoError);
  const err: any = new Error(traducido.mensaje);
  err.statusCode = traducido.status;
  throw err;
}
