export type ResultadoSincronizacion = {
    ok: boolean;
    pendientes: number;
    procesados: number;
    conflictos: number;
    mensaje: string;
};
export declare function sincronizarConNeon(): Promise<ResultadoSincronizacion>;
//# sourceMappingURL=sincronizar.d.ts.map