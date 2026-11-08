import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const SECRETO = process.env.SESSION_SECRET || 'csc200-secreto-cambiar-en-produccion';
const DURACION_MS = 8 * 60 * 60 * 1000;

export type RolUsuario = 'admin' | 'gestor';

export type SesionUsuario = {
  id: number;
  usuario: string;
  nombre: string;
  rol: RolUsuario;
};

export type SesionPayload = {
  uid: number;
  exp: number;
};

export function hashClave(clave: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(clave, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verificarClave(clave: string, almacenada: string): boolean {
  const [salt, hash] = String(almacenada || '').split(':');
  if (!salt || !hash) return false;

  const calculado = crypto.scryptSync(clave, salt, 64);
  const original = Buffer.from(hash, 'hex');
  if (original.length !== calculado.length) return false;

  return crypto.timingSafeEqual(original, calculado);
}

export function firmarSesion(uid: number): string {
  const payload: SesionPayload = { uid, exp: Date.now() + DURACION_MS };
  const cuerpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const firma = crypto.createHmac('sha256', SECRETO).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

export function verificarToken(token: string): SesionPayload | null {
  if (!token || !token.includes('.')) return null;

  const [cuerpo, firma] = token.split('.');
  const esperada = crypto.createHmac('sha256', SECRETO).update(cuerpo).digest('base64url');

  const a = Buffer.from(firma || '');
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    if (!payload || typeof payload.uid !== 'number' || typeof payload.exp !== 'number') {
      return null;
    }
    if (Date.now() > payload.exp) return null;
    return payload as SesionPayload;
  } catch {
    return null;
  }
}

export function leerCookie(req: Request, nombre: string): string | null {
  const cabecera = req.headers.cookie;
  if (!cabecera) return null;

  for (const parte of cabecera.split(';')) {
    const [clave, ...resto] = parte.trim().split('=');
    if (clave === nombre) {
      return decodeURIComponent(resto.join('='));
    }
  }
  return null;
}

export function guardarSesion(res: Response, uid: number): void {
  res.cookie('sesion', firmarSesion(uid), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: DURACION_MS,
    path: '/',
  });
}

export function borrarSesion(res: Response): void {
  res.clearCookie('sesion', { path: '/' });
}

export function requerirAuth(req: Request, res: Response, next: NextFunction): void {
  const usuario = res.locals.usuario as SesionUsuario | undefined;
  if (usuario) return next();

  if (req.path.startsWith('/api')) {
    res.status(401).json({ error: 'Debe iniciar sesión.' });
    return;
  }

  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

export function requerirAdmin(req: Request, res: Response, next: NextFunction): void {
  const usuario = res.locals.usuario as SesionUsuario | undefined;
  if (!usuario) {
    if (req.path.startsWith('/api')) {
      res.status(401).json({ error: 'Debe iniciar sesión.' });
      return;
    }
    res.redirect('/login');
    return;
  }

  if (usuario.rol !== 'admin') {
    if (req.path.startsWith('/api')) {
      res.status(403).json({ error: 'No tiene permisos de administrador.' });
      return;
    }
    res.status(403).render('error', {
      codigo: 403,
      mensaje: 'Esta sección requiere permisos de administrador.',
    });
    return;
  }

  next();
}
