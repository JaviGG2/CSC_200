import { Router, Request, Response } from 'express';
import {
  borrarSesion,
  guardarSesion,
  requerirAuth,
  verificarClave,
} from '../../nucleo/autenticacion';
import {
  cerrarActividadUsuario,
  contarPersonas,
  contarViviendas,
  db,
  obtenerAsistenteHabilitado,
  obtenerEstadisticasIngresos,
  obtenerUsuarioPorUsuario,
  registrarIngresoSistema,
  sincronizarConfiguracionNeon,
} from '../../nucleo/base-datos';
import { consultarAsistenteGemini } from '../../nucleo/asistente';
import { rutaLocalSegura, valorSimple } from '../../nucleo/http';

export type ModuloPortal = {
  clave: 'socioeconomico' | 'medicos' | 'beneficios';
  etiqueta: string;
  titulo: string;
  descripcion: string;
  ruta: string;
};

export const MODULOS_PORTAL: ModuloPortal[] = [
  {
    clave: 'socioeconomico',
    etiqueta: 'Módulo 1 · Censo',
    titulo: 'Socio-Demográfico',
    descripcion: 'Viviendas, familias y padrón comunal.',
    ruta: '/censo',
  },
  {
    clave: 'medicos',
    etiqueta: 'Módulo 2 · Salud',
    titulo: 'Expedientes Médicos',
    descripcion: 'Historias clínicas y seguimiento de salud.',
    ruta: '/expedientes-medicos',
  },
  {
    clave: 'beneficios',
    etiqueta: 'Módulo 3 · Ayudas',
    titulo: 'Beneficios',
    descripcion: 'Entregas y programas sociales.',
    ruta: '/beneficios',
  },
];

function detectarModuloPorRuta(ruta: string): ModuloPortal['clave'] | null {
  if (ruta.startsWith('/expedientes-medicos')) return 'medicos';
  if (ruta.startsWith('/beneficios')) return 'beneficios';
  if (
    ruta.startsWith('/censo') ||
    ruta.startsWith('/wizard') ||
    ruta.startsWith('/personas') ||
    ruta.startsWith('/viviendas') ||
    ruta.startsWith('/ubicacion') ||
    ruta.startsWith('/campos') ||
    ruta.startsWith('/admin')
  ) {
    return 'socioeconomico';
  }
  return null;
}

function resumenCompartidoBaseDatos() {
  const expedientes = Number(
    (db.prepare('SELECT COUNT(*) AS total FROM expedientes_medicos').get() as { total: number })
      ?.total || 0
  );
  const beneficios = Number(
    (db.prepare('SELECT COUNT(*) AS total FROM beneficios_entregas').get() as { total: number })
      ?.total || 0
  );

  return {
    viviendas: contarViviendas(),
    personas: contarPersonas(),
    expedientes,
    beneficios,
    ingresos: obtenerEstadisticasIngresos(),
  };
}

function renderizarLogin(
  res: Response,
  {
    status = 200,
    error = null,
    usuarioValor = '',
    next = '',
    modulo = null,
  }: {
    status?: number;
    error?: string | null;
    usuarioValor?: string;
    next?: string;
    modulo?: ModuloPortal['clave'] | null;
  }
) {
  const destino = next && next !== '/' ? next : '';
  const moduloSeleccionado =
    modulo ||
    (destino ? detectarModuloPorRuta(destino) : null);

  return res.status(status).render('login', {
    error,
    usuarioValor,
    next: destino,
    moduloSeleccionado,
    modulos: MODULOS_PORTAL,
  });
}

export function crearRouterPortal(): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    if (!res.locals.usuario) {
      const nextParam = typeof req.query.next === 'string' ? rutaLocalSegura(req.query.next, '') : '';
      return renderizarLogin(res, { next: nextParam });
    }

    return res.render('portal/inicio', {
      modulos: MODULOS_PORTAL,
      resumen: resumenCompartidoBaseDatos(),
    });
  });

  router.get('/inicio', requerirAuth, (_req: Request, res: Response) => {
    return res.render('portal/inicio', {
      modulos: MODULOS_PORTAL,
      resumen: resumenCompartidoBaseDatos(),
    });
  });

  router.get('/api/status-people', requerirAuth, (_req: Request, res: Response) => {
    return res.json({
      ok: true,
      ...obtenerEstadisticasIngresos(),
    });
  });

  router.post('/api/asistente/chat', requerirAuth, async (req: Request, res: Response) => {
    try {
      if (!obtenerAsistenteHabilitado()) {
        return res.status(403).json({
          error: 'El asistente de orientación está deshabilitado en los ajustes.',
        });
      }

      const mensaje = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
      if (!mensaje) {
        return res.status(400).json({ error: 'Escriba una consulta para el asistente.' });
      }
      if (mensaje.length > 1500) {
        return res.status(400).json({ error: 'La consulta excede el máximo de 1500 caracteres.' });
      }

      const reply = await consultarAsistenteGemini({
        mensaje,
        historial: req.body?.history,
        rutaActual: typeof req.body?.rutaActual === 'string' ? req.body.rutaActual : '',
      });

      return res.json({
        ok: true,
        reply,
      });
    } catch (error: any) {
      const status = Number(error?.statusCode) || 502;
      return res.status(status).json({
        error:
          error?.message ||
          'No se pudo obtener respuesta del asistente en este momento.',
      });
    }
  });

  router.get('/login', (req: Request, res: Response) => {
    const usuarioActual = res.locals.usuario;
    const nextParam = typeof req.query.next === 'string' ? rutaLocalSegura(req.query.next, '') : '';
    const moduloParam = valorSimple(req.query.modulo);
    const moduloValido = MODULOS_PORTAL.find((m) => m.clave === moduloParam)?.clave || null;

    if (usuarioActual) {
      return res.redirect(nextParam || (moduloValido ? MODULOS_PORTAL.find((m) => m.clave === moduloValido)!.ruta : '/inicio'));
    }

    const nextFinal =
      nextParam || (moduloValido ? MODULOS_PORTAL.find((m) => m.clave === moduloValido)!.ruta : '');

    return renderizarLogin(res, {
      next: nextFinal,
      modulo: moduloValido,
    });
  });

  router.post('/login', async (req: Request, res: Response) => {
    try {
      const usuarioValor = valorSimple(req.body.usuario);
      const clave = typeof req.body.clave === 'string' ? req.body.clave : '';
      const destino = rutaLocalSegura(req.body.next, '/inicio');
      const moduloRaw = valorSimple(req.body.modulo);
      const moduloSeleccionado =
        MODULOS_PORTAL.find((m) => m.clave === moduloRaw)?.clave ||
        detectarModuloPorRuta(destino);

      await sincronizarConfiguracionNeon().catch(() => null);
      let cuenta = usuarioValor ? obtenerUsuarioPorUsuario(usuarioValor) : null;

      if ((!cuenta || !cuenta.activo || !verificarClave(clave, cuenta.clave_hash)) && usuarioValor) {
        const resSync = await sincronizarConfiguracionNeon({ forzar: true }).catch(() => null);
        if (resSync?.ok) {
          cuenta = obtenerUsuarioPorUsuario(usuarioValor);
        }
      }

      if (!cuenta || !cuenta.activo || !verificarClave(clave, cuenta.clave_hash)) {
        return renderizarLogin(res, {
          status: 401,
          error: 'Usuario o contraseña incorrectos.',
          usuarioValor,
          next: typeof req.body.next === 'string' ? req.body.next : '',
          modulo: moduloSeleccionado,
        });
      }

      guardarSesion(res, cuenta.id);
      registrarIngresoSistema({
        usuario_id: cuenta.id,
        usuario: cuenta.usuario,
        nombre: cuenta.nombre,
        rol: cuenta.rol,
        modulo: moduloSeleccionado || 'portal',
      });
      return res.redirect(destino);
    } catch (error) {
      console.error('[login]', error);
      return renderizarLogin(res, {
        status: 500,
        error: 'No se pudo iniciar sesión. Intente de nuevo.',
      });
    }
  });

  router.post('/logout', (_req: Request, res: Response) => {
    const usuarioActual = res.locals.usuario as { id?: number } | undefined;
    if (usuarioActual?.id) {
      cerrarActividadUsuario(Number(usuarioActual.id));
    }
    borrarSesion(res);
    return res.redirect('/login');
  });

  return router;
}
