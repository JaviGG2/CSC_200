import type { Request, Response, NextFunction } from 'express';
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
export declare function hashClave(clave: string): string;
export declare function verificarClave(clave: string, almacenada: string): boolean;
export declare function firmarSesion(uid: number): string;
export declare function verificarToken(token: string): SesionPayload | null;
export declare function leerCookie(req: Request, nombre: string): string | null;
export declare function guardarSesion(res: Response, uid: number): void;
export declare function borrarSesion(res: Response): void;
export declare function requerirAuth(req: Request, res: Response, next: NextFunction): void;
export declare function requerirAdmin(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map