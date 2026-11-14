import { Client } from 'pg';
export type ResultadoEsquemaNeon = {
    ok: boolean;
    configurado: boolean;
    mensaje: string;
};
export type ResultadoGuardadoNeon = {
    ok: boolean;
    configurado: boolean;
    aplicado: boolean;
    mensaje: string;
};
export declare function crearClienteNeon(): Client | null;
export declare function aplicarEsquemaNeon(cliente: Client): Promise<void>;
export declare function inicializarEsquemaNeon(): Promise<ResultadoEsquemaNeon>;
export declare function guardarViviendaConCliente(cliente: Client, viviendaId: number): Promise<{
    viviendaNeonId: number;
    jefeNeonId: number;
}>;
export declare function guardarViviendaEnNeon(viviendaId: number): Promise<ResultadoGuardadoNeon>;
//# sourceMappingURL=neon.d.ts.map