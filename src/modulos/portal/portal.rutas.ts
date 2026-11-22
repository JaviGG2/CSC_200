import { Router, Request, Response } from 'express';
import {
  borrarSesion,
  guardarSesion,
  requerirAuth,
  verificarClave,
} from '../../nucleo/autenticacion';
import {
  contarPersonas,
  contarViviendas,
  db,
  obtenerUsuarioPorUsuario,
  sincronizarConfiguracionNeon,
} from '../../nucleo/base-datos';
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
    etiqueta: 'Módulo 1 · Censo General',
    titulo: 'Socio-Demográfico',
    descripcion: 'Registro socio-demográfico de viviendas, grupos familiares, ingresos, territorio y padrón comunal.',
    ruta: '/censo',
  },
  {
    clave: 'medicos',
    etiqueta: 'Módulo 2 · Salud Comunitaria',
    titulo: 'Expedientes Médicos',
    descripcion: 'Historias clínicas, condiciones crónicas, discapacidad, medicamentos y controles.',
    ruta: '/expedientes-medicos',
  },
  {
    clave: 'beneficios',
    etiqueta: 'Módulo 3 · Programas Sociales',
    titulo: 'Beneficios',
    descripcion: 'Control de entregas, ayudas sociales, bolsas alimentarias y seguimiento por familia.',
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
    borrarSesion(res);
    return res.redirect('/login');
  });

  return router;
}
