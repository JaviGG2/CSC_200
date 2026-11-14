export type ResultadoConfiguracionNeon = {
    ok: boolean;
    configurado: boolean;
    mensaje: string;
};
export declare function sincronizarConfiguracionNeon({ forzar, }?: {
    forzar?: boolean;
}): Promise<ResultadoConfiguracionNeon>;
export declare function invalidarCacheConfiguracion(): void;
export declare function guardarConsejoEnNeon({ nombre, sector, activo, }: {
    nombre: string;
    sector: string | null;
    activo: boolean;
}): Promise<ResultadoConfiguracionNeon>;
export declare function guardarOpcionEnNeon({ campo, valor, valorOriginal, etiqueta, orden, activo, }: {
    campo: string;
    valor: string;
    valorOriginal?: string;
    etiqueta: string | null;
    orden: number;
    activo: boolean;
}): Promise<ResultadoConfiguracionNeon>;
export declare function cambiarEstadoOpcionEnNeon(campo: string, valor: string): Promise<ResultadoConfiguracionNeon>;
export declare function eliminarOpcionEnNeon(campo: string, valor: string): Promise<ResultadoConfiguracionNeon>;
export declare function guardarConfigCamposEnNeon(campos: Array<{
    clave: string;
    etiqueta: string;
    seccion: string;
    visible: boolean;
    requerido: boolean;
    orden: number;
}>): Promise<ResultadoConfiguracionNeon>;
export declare function eliminarTerritorioEnNeon({ tipo, nombre, }: {
    tipo: string;
    nombre: string;
}): Promise<ResultadoConfiguracionNeon>;
export declare function guardarTerritorioEnNeon({ tipo, nombre, padreNombre, activo, }: {
    tipo: string;
    nombre: string;
    padreNombre?: string | null;
    activo?: boolean;
}): Promise<ResultadoConfiguracionNeon>;
//# sourceMappingURL=configuracion-neon.d.ts.map