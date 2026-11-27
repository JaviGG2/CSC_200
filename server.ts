import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import express, { Request, Response, NextFunction } from 'express';

dotenv.config({ quiet: true });

import { leerCookie, verificarToken } from './src/nucleo/autenticacion';
import {
  inicializarEsquemaNeon,
  obtenerUsuarioPorId,
  registrarActividadUsuario,
  rutaBaseDatos,
  sincronizarConfiguracionNeon,
} from './src/nucleo/base-datos';
import { crearRouterBeneficios } from './src/modulos/beneficios/beneficios.rutas';
import { crearRouterMedicos } from './src/modulos/medicos/medicos.rutas';
import { crearRouterPortal } from './src/modulos/portal/portal.rutas';
import { crearRouterSocioeconomico } from './src/modulos/socioeconomico/socioeconomico.rutas';
import { renderizar, renderizarCampos } from './src/modulos/socioeconomico/socioeconomico.servicio';

const app = express();
const PUERTO = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '12mb' }));
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(process.cwd(), 'public')));

// Carga la sesión del usuario a partir de la cookie firmada compartida por los módulos.
app.use((req: Request, res: Response, next: NextFunction) => {
  const token = leerCookie(req, 'sesion');
  const sesion = token ? verificarToken(token) : null;

  if (sesion) {
    const usuario = obtenerUsuarioPorId(sesion.uid);
    if (usuario && usuario.activo) {
      res.locals.usuario = usuario;
      res.locals.esAdmin = usuario.rol === 'admin';
      (req as any).usuario = usuario;
      registrarActividadUsuario(usuario.id);
    }
  }

  if (typeof res.locals.esAdmin !== 'boolean') {
    res.locals.esAdmin = false;
  }

  next();
});

// Estado de navegación por módulo para aislar cada vista en la cabecera.
function calcularSeccion(req: Request): { modulo: string; subseccion: string } {
  const ruta = req.path;

  if (ruta === '/' || ruta === '/inicio' || ruta === '/login') {
    return { modulo: 'portal', subseccion: '' };
  }
  if (ruta.startsWith('/beneficios')) {
    return { modulo: 'beneficios', subseccion: 'lista' };
  }
  if (ruta.startsWith('/expedientes-medicos')) {
    return { modulo: 'expedientes', subseccion: 'lista' };
  }
  if (ruta === '/wizard') {
    return { modulo: 'censo', subseccion: 'registro' };
  }
  if (ruta.startsWith('/personas')) {
    return { modulo: 'censo', subseccion: 'personas' };
  }
  if (ruta.startsWith('/ubicacion')) {
    return { modulo: 'censo', subseccion: 'ubicacion' };
  }
  if (ruta.startsWith('/admin') || ruta.startsWith('/campos')) {
    return { modulo: 'censo', subseccion: 'admin' };
  }
  return { modulo: 'censo', subseccion: 'inicio' };
}

app.use((req: Request, res: Response, next: NextFunction) => {
  const { modulo, subseccion } = calcularSeccion(req);
  res.locals.modulo = modulo;
  res.locals.subseccion = subseccion;
  res.locals.ruta = req.path;
  next();
});

// Módulos independientes acoplados únicamente a través de la base de datos compartida.
app.use(crearRouterPortal());
app.use(crearRouterMedicos());
app.use(crearRouterBeneficios());
app.use(crearRouterSocioeconomico());

app.use((req: Request, res: Response) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Ruta no encontrada.' });
  }
  return res.status(404).render('error', {
    codigo: 404,
    mensaje: 'La página solicitada no existe.',
  });
});

app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  console.error('[error]', error);

  if (res.headersSent) return next(error);

  try {
    if (req.path.endsWith('.csv')) {
      return res.status(500).type('text/plain').send('No se pudo generar el archivo CSV.');
    }

    if (req.path.startsWith('/campos')) {
      return renderizarCampos(res, {
        status: 500,
        error: 'Ocurrió un error interno al procesar la solicitud.',
      });
    }

    if (req.path.startsWith('/api')) {
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }

    if (req.path.startsWith('/censo')) {
      return renderizar(res, {
        status: 500,
        error: 'Ocurrió un error interno al procesar la solicitud.',
      });
    }

    return res.status(500).render('error', {
      codigo: 500,
      mensaje: 'Ocurrió un error interno al procesar la solicitud.',
    });
  } catch {
    return res.status(500).type('text/plain').send('Error interno del servidor.');
  }
});

function direccionesDeRed(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((conexion: any) => conexion && conexion.family === 'IPv4' && !conexion.internal)
    .map((conexion: any) => conexion.address);
}

if (require.main === module) {
  app.listen(PUERTO, HOST, () => {
    console.log('');
    console.log('  Comuna Socialista Carabobo 200 · Plataforma Modular');
    console.log(`  Servidor:    http://localhost:${PUERTO}`);
    console.log(`  Base común:  ${rutaBaseDatos}`);

    if (HOST === '0.0.0.0') {
      for (const direccion of direccionesDeRed()) {
        console.log(`  Red local:   http://${direccion}:${PUERTO}`);
      }
    }

    console.log('');
    console.log('  Módulos activos: Socio-Demográfico · Expedientes Médicos · Beneficios');
    console.log('  Presione Ctrl+C para detener el servidor.');
    console.log('');

    (async () => {
      try {
        const esquema = await inicializarEsquemaNeon();

        if (esquema.ok) {
          console.log(`  Neon:        ${esquema.mensaje}`);
          const config = await sincronizarConfiguracionNeon({ forzar: true });
          console.log(`  Config:      ${config.mensaje}`);
        } else {
          console.log('  Neon:        Modo local SQLite activo (sin conexión remota).');
        }
      } catch {
        console.log('  Neon:        Modo local SQLite activo (sin conexión remota).');
      }
    })();
  });
}

export default app;
module.exports = app;
