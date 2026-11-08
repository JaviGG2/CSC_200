"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashClave = hashClave;
exports.verificarClave = verificarClave;
exports.firmarSesion = firmarSesion;
exports.verificarToken = verificarToken;
exports.leerCookie = leerCookie;
exports.guardarSesion = guardarSesion;
exports.borrarSesion = borrarSesion;
exports.requerirAuth = requerirAuth;
exports.requerirAdmin = requerirAdmin;
const crypto_1 = __importDefault(require("crypto"));
const SECRETO = process.env.SESSION_SECRET || 'csc200-secreto-cambiar-en-produccion';
const DURACION_MS = 8 * 60 * 60 * 1000;
function hashClave(clave) {
    const salt = crypto_1.default.randomBytes(16).toString('hex');
    const hash = crypto_1.default.scryptSync(clave, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}
function verificarClave(clave, almacenada) {
    const [salt, hash] = String(almacenada || '').split(':');
    if (!salt || !hash)
        return false;
    const calculado = crypto_1.default.scryptSync(clave, salt, 64);
    const original = Buffer.from(hash, 'hex');
    if (original.length !== calculado.length)
        return false;
    return crypto_1.default.timingSafeEqual(original, calculado);
}
function firmarSesion(uid) {
    const payload = { uid, exp: Date.now() + DURACION_MS };
    const cuerpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const firma = crypto_1.default.createHmac('sha256', SECRETO).update(cuerpo).digest('base64url');
    return `${cuerpo}.${firma}`;
}
function verificarToken(token) {
    if (!token || !token.includes('.'))
        return null;
    const [cuerpo, firma] = token.split('.');
    const esperada = crypto_1.default.createHmac('sha256', SECRETO).update(cuerpo).digest('base64url');
    const a = Buffer.from(firma || '');
    const b = Buffer.from(esperada);
    if (a.length !== b.length || !crypto_1.default.timingSafeEqual(a, b))
        return null;
    try {
        const payload = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
        if (!payload || typeof payload.uid !== 'number' || typeof payload.exp !== 'number') {
            return null;
        }
        if (Date.now() > payload.exp)
            return null;
        return payload;
    }
    catch {
        return null;
    }
}
function leerCookie(req, nombre) {
    const cabecera = req.headers.cookie;
    if (!cabecera)
        return null;
    for (const parte of cabecera.split(';')) {
        const [clave, ...resto] = parte.trim().split('=');
        if (clave === nombre) {
            return decodeURIComponent(resto.join('='));
        }
    }
    return null;
}
function guardarSesion(res, uid) {
    res.cookie('sesion', firmarSesion(uid), {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: DURACION_MS,
        path: '/',
    });
}
function borrarSesion(res) {
    res.clearCookie('sesion', { path: '/' });
}
function requerirAuth(req, res, next) {
    const usuario = res.locals.usuario;
    if (usuario)
        return next();
    if (req.path.startsWith('/api')) {
        res.status(401).json({ error: 'Debe iniciar sesión.' });
        return;
    }
    res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}
function requerirAdmin(req, res, next) {
    const usuario = res.locals.usuario;
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
//# sourceMappingURL=auth.js.map