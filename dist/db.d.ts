import Database from 'better-sqlite3';
export declare const rutaBaseDatos: string;
export declare const db: InstanceType<typeof Database>;
export type Vivienda = {
    id: number;
    estado: string;
    municipio: string;
    parroquia: string;
    comunidad: string;
    etapa: string | null;
    manzana: string | null;
    direccion: string;
    numero_casa: string | null;
    fecha_registro: string;
    sincronizado: boolean;
    sincronizado_en: string | null;
    sincronizar_neon: boolean;
};
export type JefeFamilia = {
    id: number;
    vivienda_id: number;
    cedula_tipo: 'V' | 'E';
    cedula_numero: string;
    nombres: string;
    apellidos: string;
    fecha_nacimiento: string;
    edad: number | null;
    sexo: 'M' | 'F';
    telefono_movil: string | null;
    telefono_habitacion: string | null;
    telefono_trabajo: string | null;
    correo: string | null;
    nivel_instruccion: string;
    estado_civil: string;
    profesion: string | null;
    trabaja_actual: 'Sí' | 'No';
    clasificacion_ingresos: string;
    frecuencia_ingresos: string | null;
};
export type IntegranteFamiliar = {
    id: number;
    vivienda_id: number;
    numero: number;
    apellidos: string;
    nombres: string;
    cedula_tipo: 'V' | 'E' | null;
    cedula_numero: string | null;
    fecha_nacimiento: string | null;
    edad: number | null;
    sexo: 'M' | 'F' | null;
    parentesco: string;
    nivel_instruccion: string | null;
    profesion: string | null;
};
export type CampoFormulario = {
    id: number;
    clave: string;
    etiqueta: string;
    tipo: string;
    opciones: string[];
    requerido: boolean;
    ayuda: string | null;
    orden: number;
    activo: boolean;
};
export type RegistroCenso = {
    id: number;
    cedula: string;
    nombres: string;
    apellidos: string;
    fecha_nacimiento: string;
    datos_extras: Record<string, unknown>;
    sincronizado: boolean;
    sincronizado_en: string | null;
    valores: Record<string, string>;
    extras: Array<{
        clave: string;
        etiqueta: string;
        valor: string;
    }>;
};
export type Usuario = {
    id: number;
    usuario: string;
    nombre: string;
    rol: 'admin' | 'gestor';
    activo: boolean;
    creado_en: string;
};
export type TipoTerritorio = 'estado' | 'municipio' | 'parroquia' | 'comunidad' | 'etapa' | 'manzana';
export type Territorio = {
    id: number;
    tipo: TipoTerritorio;
    nombre: string;
    padre_id: number | null;
    padre_nombre: string | null;
    activo: boolean;
    orden: number;
};
export type ConfigCampo = {
    clave: string;
    etiqueta: string;
    seccion: string;
    visible: boolean;
    requerido: boolean;
    orden: number;
};
export type PersonaIndividual = {
    tipo: 'jefe' | 'integrante';
    persona_id: number;
    vivienda_id: number;
    cedula: string | null;
    cedula_tipo: string | null;
    cedula_numero: string | null;
    nombres: string;
    apellidos: string;
    fecha_nacimiento: string | null;
    edad: number | null;
    sexo: 'M' | 'F' | null;
    parentesco: string;
    nivel_instruccion: string | null;
    profesion: string | null;
    trabaja_actual: string | null;
    estado_civil: string | null;
    telefono_movil: string | null;
    telefono_habitacion: string | null;
    telefono_trabajo: string | null;
    correo: string | null;
    estado: string;
    municipio: string;
    parroquia: string;
    comunidad: string;
    etapa: string | null;
    manzana: string | null;
    direccion: string;
    numero_casa: string | null;
};
export declare const CLAVES_RESERVADAS: string[];
export declare const TIPOS_CAMPO: string[];
export declare function obtenerCampos({ soloActivos }?: {
    soloActivos?: boolean | undefined;
}): CampoFormulario[];
export declare function obtenerCamposFormulario(): CampoFormulario[];
export declare function obtenerRegistros(): RegistroCenso[];
export declare function obtenerRegistroPorId(id: number): RegistroCenso | null;
export declare function obtenerEstadisticas(): {
    campos: number;
    total: number;
    pendientes: number;
    sincronizados: number;
};
export declare function crearCampo({ etiqueta, tipo, opciones, requerido }: {
    etiqueta: string;
    tipo: string;
    opciones?: string[];
    requerido: boolean;
}): string;
export declare function obtenerCampoPorId(id: number): CampoFormulario | null;
export declare function actualizarCampo({ id, etiqueta, tipo, opciones, requerido }: {
    id: number;
    etiqueta: string;
    tipo: string;
    opciones?: string[];
    requerido: boolean;
}): boolean;
export declare function cambiarEstadoCampo(id: number): boolean | null;
export declare function eliminarCampo(id: number): boolean;
export declare function renumerarRegistros(): void;
export declare function eliminarRegistro(id: number): boolean;
export declare function vaciarRegistros(): number;
export declare function insertarVivienda({ estado, municipio, parroquia, comunidad, etapa, manzana, direccion, numero_casa, sincronizar_neon, }: {
    estado?: string;
    municipio?: string;
    parroquia?: string;
    comunidad: string;
    etapa?: string | null;
    manzana?: string | null;
    direccion: string;
    numero_casa?: string | null;
    sincronizar_neon?: boolean;
}): number;
export declare function obtenerViviendaPorId(id: number): Vivienda | null;
export declare function cambiarSincronizarNeon(id: number, sincronizar_neon: boolean): boolean;
export declare function obtenerViviendas({ q, page, limit, }: {
    q?: string;
    page?: number;
    limit?: number;
}): {
    viviendas: Vivienda[];
    total: number;
};
export declare function actualizarVivienda({ id, estado, municipio, parroquia, comunidad, etapa, manzana, direccion, numero_casa, sincronizar_neon, }: {
    id: number;
    estado?: string;
    municipio?: string;
    parroquia?: string;
    comunidad?: string;
    etapa?: string | null;
    manzana?: string | null;
    direccion?: string;
    numero_casa?: string | null;
    sincronizar_neon?: boolean;
}): boolean;
export declare function eliminarVivienda(id: number): boolean;
export declare function insertarJefeFamilia({ vivienda_id, cedula_tipo, cedula_numero, nombres, apellidos, fecha_nacimiento, sexo, telefono_movil, telefono_habitacion, telefono_trabajo, correo, nivel_instruccion, estado_civil, profesion, trabaja_actual, clasificacion_ingresos, frecuencia_ingresos, }: {
    vivienda_id: number;
    cedula_tipo: 'V' | 'E';
    cedula_numero: string;
    nombres: string;
    apellidos: string;
    fecha_nacimiento: string;
    sexo: 'M' | 'F';
    telefono_movil?: string | null;
    telefono_habitacion?: string | null;
    telefono_trabajo?: string | null;
    correo?: string | null;
    nivel_instruccion: string;
    estado_civil: string;
    profesion?: string | null;
    trabaja_actual: 'Sí' | 'No';
    clasificacion_ingresos: string;
    frecuencia_ingresos?: string | null;
}): number;
export declare function obtenerJefePorVivienda(viviendaId: number): JefeFamilia | null;
export declare function actualizarJefeFamilia({ id, cedula_tipo, cedula_numero, nombres, apellidos, fecha_nacimiento, sexo, telefono_movil, telefono_habitacion, telefono_trabajo, correo, nivel_instruccion, estado_civil, profesion, trabaja_actual, clasificacion_ingresos, frecuencia_ingresos, }: {
    id: number;
    cedula_tipo?: 'V' | 'E';
    cedula_numero?: string;
    nombres?: string;
    apellidos?: string;
    fecha_nacimiento?: string;
    sexo?: 'M' | 'F';
    telefono_movil?: string | null;
    telefono_habitacion?: string | null;
    telefono_trabajo?: string | null;
    correo?: string | null;
    nivel_instruccion?: string;
    estado_civil?: string;
    profesion?: string | null;
    trabaja_actual?: 'Sí' | 'No';
    clasificacion_ingresos?: string;
    frecuencia_ingresos?: string | null;
}): boolean;
export declare function insertarIntegrante({ vivienda_id, numero, apellidos, nombres, cedula_tipo, cedula_numero, fecha_nacimiento, sexo, parentesco, nivel_instruccion, profesion, }: {
    vivienda_id: number;
    numero: number;
    apellidos: string;
    nombres: string;
    cedula_tipo?: 'V' | 'E' | null;
    cedula_numero?: string | null;
    fecha_nacimiento?: string | null;
    sexo?: 'M' | 'F' | null;
    parentesco: string;
    nivel_instruccion?: string | null;
    profesion?: string | null;
}): number;
export declare function obtenerIntegrantesPorVivienda(viviendaId: number): IntegranteFamiliar[];
export declare function actualizarIntegrante({ id, numero, apellidos, nombres, cedula_tipo, cedula_numero, fecha_nacimiento, sexo, parentesco, nivel_instruccion, profesion, }: {
    id: number;
    numero?: number;
    apellidos?: string;
    nombres?: string;
    cedula_tipo?: 'V' | 'E' | null;
    cedula_numero?: string | null;
    fecha_nacimiento?: string | null;
    sexo?: 'M' | 'F' | null;
    parentesco?: string;
    nivel_instruccion?: string | null;
    profesion?: string | null;
}): boolean;
export declare function eliminarIntegrante(id: number): boolean;
export declare function obtenerExpedienteVivienda(viviendaId: number): {
    vivienda: Vivienda | null;
    jefe: JefeFamilia | null;
    integrantes: IntegranteFamiliar[];
} | null;
export declare function crearViviendaCompleta({ vivienda, jefe, integrantes, }: {
    vivienda: Omit<Vivienda, 'id' | 'fecha_registro' | 'sincronizado' | 'sincronizado_en'>;
    jefe: Omit<JefeFamilia, 'id' | 'vivienda_id' | 'edad'>;
    integrantes: Array<Omit<IntegranteFamiliar, 'id' | 'vivienda_id' | 'edad'>>;
}): {
    viviendaId: number;
    jefeId: number;
    integrantesIds: number[];
};
export declare function listarUsuarios(): Usuario[];
export declare function obtenerUsuarioPorId(id: number): Usuario | null;
export declare function obtenerUsuarioPorUsuario(usuario: string): (Usuario & {
    clave_hash: string;
}) | null;
export declare function crearUsuario({ usuario, nombre, clave, rol, }: {
    usuario: string;
    nombre: string;
    clave: string;
    rol: 'admin' | 'gestor';
}): number;
export declare function actualizarUsuario({ id, nombre, rol, activo, clave, }: {
    id: number;
    nombre?: string;
    rol?: 'admin' | 'gestor';
    activo?: boolean;
    clave?: string | null;
}): boolean;
export declare function eliminarUsuario(id: number): boolean;
export declare function contarAdminsActivos(): number;
export declare function listarTerritorios({ tipo, padreId, soloActivos, }?: {
    tipo?: TipoTerritorio | null;
    padreId?: number | null;
    soloActivos?: boolean;
}): Territorio[];
export declare function obtenerTerritorioPorId(id: number): Territorio | null;
export declare function crearTerritorio({ tipo, nombre, padre_id, }: {
    tipo: TipoTerritorio;
    nombre: string;
    padre_id?: number | null;
}): number;
export declare function actualizarTerritorio({ id, nombre, padre_id, activo, }: {
    id: number;
    nombre?: string;
    padre_id?: number | null;
    activo?: boolean;
}): boolean;
export declare function eliminarTerritorio(id: number): boolean;
export declare function listarConfigCampos(): ConfigCampo[];
export declare function obtenerConfigCamposMap(): Record<string, {
    visible: boolean;
    requerido: boolean;
}>;
export declare function actualizarConfigCampo({ clave, visible, requerido, }: {
    clave: string;
    visible?: boolean;
    requerido?: boolean;
}): boolean;
export declare function obtenerPersonas(filtros?: {
    q?: string;
    sexo?: string;
    edadMin?: number | null;
    edadMax?: number | null;
    nivel?: string;
    trabaja?: string;
    parentesco?: string;
    manzana?: string;
    etapa?: string;
    comunidad?: string;
    tipo?: string;
}): {
    personas: PersonaIndividual[];
    total: number;
};
export declare function obtenerPersonaIndividual(tipo: string, id: number): PersonaIndividual | null;
export declare function contarPersonas(): number;
export declare function contarViviendas(): number;
//# sourceMappingURL=db.d.ts.map