export type ResultadoSincronizacion = {
    ok: boolean;
    pendientes: number;
    procesados: number;
    conflictos: number;
    mensaje: string;
};
export type ResultadoNeon = {
    ok: boolean;
    configurado: boolean;
    aplicado: boolean;
    mensaje: string;
};
type ViviendaBase = {
    id: number;
    comunidad: string;
    etapa: string | null;
    manzana: string | null;
    direccion: string;
    numero_casa: string | null;
    fecha_registro: string;
};
type ViviendaPendiente = ViviendaBase & {
    cedula: string;
    nombres: string;
    apellidos: string;
    fecha_nacimiento: string | null;
    datos_extras: Record<string, unknown>;
};
export declare function construirRegistroNeon(viviendaId: number): ViviendaPendiente | null;
export declare function eliminarRegistroEnNeon(cedula: string): Promise<ResultadoNeon>;
export declare function actualizarViviendaEnNeon(viviendaId: number): Promise<ResultadoNeon>;
export declare function sincronizarConNeon(): Promise<ResultadoSincronizacion>;
export {};
//# sourceMappingURL=sincronizar.d.ts.map