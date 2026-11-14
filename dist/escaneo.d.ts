export type DatosPlanilla = {
    ubicacion: {
        estado: string;
        municipio: string;
        parroquia: string;
        sector: string;
        nombre_comunidad: string;
        direccion: string;
        consejo_comunal_detectado: string;
        es_anexo: boolean;
        numero_anexo: string;
        numero_casa: string;
    };
    jefe: {
        nombres: string;
        apellidos: string;
        nacionalidad: string;
        cedula: string;
        fecha_nacimiento: string;
        edad: number;
        sexo: string;
        telefono_movil: string;
        telefono_habitacion: string;
        correo: string;
        estado_civil: string;
        nivel_instruccion: string;
        profesion: string;
        trabaja_actual: boolean | null;
        clasificacion_ingresos: string;
        ingreso_mensual_bs: number;
    };
    grupo_familiar: Array<{
        apellidos: string;
        nombres: string;
        sexo: string;
        cedula: string;
        edad: number;
        fecha_nacimiento: string;
        parentesco: string;
        nivel_instruccion: string;
        ingreso_mensual: number;
        profesion: string;
    }>;
};
export type ResultadoEscaneo = {
    texto: string;
    confianza: number;
    datos: DatosPlanilla;
};
export declare function extraerDatos(textoOCR: string): DatosPlanilla;
export declare function escanearPlanilla({ imagen, }: {
    imagen: string;
    mimeType?: string;
}): Promise<ResultadoEscaneo>;
export declare function cerrarEscaneo(): Promise<void>;
//# sourceMappingURL=escaneo.d.ts.map