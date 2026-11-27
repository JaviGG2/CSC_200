import {
  db,
  asegurarEsquema,
  crearClienteNeon,
} from '../../nucleo/base-datos';

export type NivelRiesgo = 'Bajo' | 'Moderado' | 'Alto';

export type ExpedienteMedico = {
  id: number;
  vivienda_id: number | null;
  persona_tipo: 'jefe' | 'integrante' | null;
  persona_id: number | null;
  cedula: string | null;
  paciente_nombre: string;
  comunidad: string | null;
  grupo_sanguineo: string | null;
  condiciones_cronicas: string | null;
  discapacidad: string | null;
  alergias: string | null;
  medicamentos_actuales: string | null;
  nivel_riesgo: NivelRiesgo;
  ultima_consulta: string | null;
  observaciones: string | null;
  registrado_por: string | null;
  sincronizado: boolean;
  creado_en: string;
  actualizado_en: string;
};

export type PersonaCompartida = {
  tipo: 'jefe' | 'integrante';
  persona_id: number;
  vivienda_id: number;
  cedula: string | null;
  nombres: string;
  apellidos: string;
  comunidad: string;
  edad: number | null;
  sexo: string | null;
};

function formatearExpediente(fila: any): ExpedienteMedico {
  return {
    id: fila.id,
    vivienda_id: fila.vivienda_id ?? null,
    persona_tipo: fila.persona_tipo ?? null,
    persona_id: fila.persona_id ?? null,
    cedula: fila.cedula ?? null,
    paciente_nombre: fila.paciente_nombre,
    comunidad: fila.comunidad ?? null,
    grupo_sanguineo: fila.grupo_sanguineo ?? null,
    condiciones_cronicas: fila.condiciones_cronicas ?? null,
    discapacidad: fila.discapacidad ?? null,
    alergias: fila.alergias ?? null,
    medicamentos_actuales: fila.medicamentos_actuales ?? null,
    nivel_riesgo: (fila.nivel_riesgo as NivelRiesgo) || 'Bajo',
    ultima_consulta: fila.ultima_consulta ?? null,
    observaciones: fila.observaciones ?? null,
    registrado_por: fila.registrado_por ?? null,
    sincronizado: Boolean(fila.sincronizado),
    creado_en: fila.creado_en,
    actualizado_en: fila.actualizado_en,
  };
}

export function listarExpedientesMedicos({
  q = '',
  nivelRiesgo = '',
  discapacidad = '',
}: {
  q?: string;
  nivelRiesgo?: string;
  discapacidad?: string;
} = {}): ExpedienteMedico[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.trim()) {
    const like = `%${q.trim()}%`;
    where.push(
      '(paciente_nombre LIKE ? OR cedula LIKE ? OR comunidad LIKE ? OR condiciones_cronicas LIKE ? OR medicamentos_actuales LIKE ?)'
    );
    params.push(like, like, like, like, like);
  }
  if (nivelRiesgo) {
    where.push('nivel_riesgo = ?');
    params.push(nivelRiesgo);
  }
  if (discapacidad === 'con') {
    where.push("discapacidad IS NOT NULL AND TRIM(discapacidad) <> '' AND lower(discapacidad) <> 'ninguna'");
  } else if (discapacidad === 'sin') {
    where.push("(discapacidad IS NULL OR TRIM(discapacidad) = '' OR lower(discapacidad) = 'ninguna')");
  }

  const condicion = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const filas = db
    .prepare(`
      SELECT * FROM expedientes_medicos
      ${condicion}
      ORDER BY CASE nivel_riesgo WHEN 'Alto' THEN 1 WHEN 'Moderado' THEN 2 ELSE 3 END, actualizado_en DESC, id DESC
    `)
    .all(...params) as any[];

  return filas.map(formatearExpediente);
}

export function obtenerExpedienteMedicoPorId(id: number): ExpedienteMedico | null {
  const fila = db.prepare('SELECT * FROM expedientes_medicos WHERE id = ?').get(id) as any;
  return fila ? formatearExpediente(fila) : null;
}

export function obtenerEstadisticasMedicas(): {
  total: number;
  riesgoAlto: number;
  riesgoModerado: number;
  conDiscapacidad: number;
  conCronicas: number;
  pendientesSync: number;
  riesgo_alto: number;
  riesgo_moderado: number;
  con_discapacidad: number;
  con_cronicas: number;
  pendientes_sync: number;
} {
  const fila = db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN nivel_riesgo = 'Alto' THEN 1 ELSE 0 END), 0) AS riesgoAlto,
        COALESCE(SUM(CASE WHEN nivel_riesgo = 'Moderado' THEN 1 ELSE 0 END), 0) AS riesgoModerado,
        COALESCE(SUM(CASE WHEN discapacidad IS NOT NULL AND TRIM(discapacidad) <> '' AND lower(discapacidad) <> 'ninguna' THEN 1 ELSE 0 END), 0) AS conDiscapacidad,
        COALESCE(SUM(CASE WHEN condiciones_cronicas IS NOT NULL AND TRIM(condiciones_cronicas) <> '' AND lower(condiciones_cronicas) <> 'ninguna' THEN 1 ELSE 0 END), 0) AS conCronicas,
        COALESCE(SUM(CASE WHEN sincronizado = 0 THEN 1 ELSE 0 END), 0) AS pendientesSync
      FROM expedientes_medicos
    `)
    .get() as any;

  const alto = Number(fila?.riesgoAlto || 0);
  const moderado = Number(fila?.riesgoModerado || 0);
  const discapacidad = Number(fila?.conDiscapacidad || 0);
  const cronicas = Number(fila?.conCronicas || 0);
  const pendientes = Number(fila?.pendientesSync || 0);

  return {
    total: Number(fila?.total || 0),
    riesgoAlto: alto,
    riesgoModerado: moderado,
    conDiscapacidad: discapacidad,
    conCronicas: cronicas,
    pendientesSync: pendientes,
    riesgo_alto: alto,
    riesgo_moderado: moderado,
    con_discapacidad: discapacidad,
    con_cronicas: cronicas,
    pendientes_sync: pendientes,
  };
}

export function listarPersonasCompartidas(): PersonaCompartida[] {
  return db
    .prepare(`
      SELECT tipo, persona_id, vivienda_id, cedula, nombres, apellidos, comunidad, edad, sexo
      FROM vista_personas_individuales
      ORDER BY apellidos COLLATE NOCASE, nombres COLLATE NOCASE
    `)
    .all() as PersonaCompartida[];
}

export function crearExpedienteMedico(datos: {
  vivienda_id?: number | null;
  persona_tipo?: 'jefe' | 'integrante' | null;
  persona_id?: number | null;
  cedula?: string | null;
  paciente_nombre: string;
  comunidad?: string | null;
  grupo_sanguineo?: string | null;
  condiciones_cronicas?: string | null;
  discapacidad?: string | null;
  alergias?: string | null;
  medicamentos_actuales?: string | null;
  nivel_riesgo: NivelRiesgo;
  ultima_consulta?: string | null;
  observaciones?: string | null;
  registrado_por?: string | null;
}): number {
  const resultado = db
    .prepare(`
      INSERT INTO expedientes_medicos (
        vivienda_id, persona_tipo, persona_id, cedula, paciente_nombre, comunidad,
        grupo_sanguineo, condiciones_cronicas, discapacidad, alergias,
        medicamentos_actuales, nivel_riesgo, ultima_consulta, observaciones, registrado_por, sincronizado
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `)
    .run(
      datos.vivienda_id ?? null,
      datos.persona_tipo ?? null,
      datos.persona_id ?? null,
      datos.cedula ?? null,
      datos.paciente_nombre,
      datos.comunidad ?? null,
      datos.grupo_sanguineo ?? null,
      datos.condiciones_cronicas ?? null,
      datos.discapacidad ?? null,
      datos.alergias ?? null,
      datos.medicamentos_actuales ?? null,
      datos.nivel_riesgo,
      datos.ultima_consulta ?? null,
      datos.observaciones ?? null,
      datos.registrado_por ?? null
    );
  return Number(resultado.lastInsertRowid);
}

export function actualizarExpedienteMedico(
  id: number,
  datos: {
    vivienda_id?: number | null;
    persona_tipo?: 'jefe' | 'integrante' | null;
    persona_id?: number | null;
    cedula?: string | null;
    paciente_nombre: string;
    comunidad?: string | null;
    grupo_sanguineo?: string | null;
    condiciones_cronicas?: string | null;
    discapacidad?: string | null;
    alergias?: string | null;
    medicamentos_actuales?: string | null;
    nivel_riesgo: NivelRiesgo;
    ultima_consulta?: string | null;
    observaciones?: string | null;
  }
): boolean {
  const res = db
    .prepare(`
      UPDATE expedientes_medicos
      SET vivienda_id = ?,
          persona_tipo = ?,
          persona_id = ?,
          cedula = ?,
          paciente_nombre = ?,
          comunidad = ?,
          grupo_sanguineo = ?,
          condiciones_cronicas = ?,
          discapacidad = ?,
          alergias = ?,
          medicamentos_actuales = ?,
          nivel_riesgo = ?,
          ultima_consulta = ?,
          observaciones = ?,
          sincronizado = 0,
          actualizado_en = datetime('now', 'localtime')
      WHERE id = ?
    `)
    .run(
      datos.vivienda_id ?? null,
      datos.persona_tipo ?? null,
      datos.persona_id ?? null,
      datos.cedula ?? null,
      datos.paciente_nombre,
      datos.comunidad ?? null,
      datos.grupo_sanguineo ?? null,
      datos.condiciones_cronicas ?? null,
      datos.discapacidad ?? null,
      datos.alergias ?? null,
      datos.medicamentos_actuales ?? null,
      datos.nivel_riesgo,
      datos.ultima_consulta ?? null,
      datos.observaciones ?? null,
      id
    );
  return res.changes > 0;
}

export function eliminarExpedienteMedico(id: number): boolean {
  return db.prepare('DELETE FROM expedientes_medicos WHERE id = ?').run(id).changes > 0;
}

export function encolarEliminacionExpedienteNeon(origenId: number): void {
  db.prepare(`
    INSERT INTO neon_modulos_eliminaciones (tabla, origen_id)
    VALUES ('expedientes_medicos', ?)
    ON CONFLICT (tabla, origen_id) DO NOTHING
  `).run(origenId);
}

async function upsertExpedienteConCliente(cliente: any, exp: ExpedienteMedico): Promise<void> {
  let viviendaNeonId: number | null = null;
  if (exp.vivienda_id) {
    const viv = await cliente.query(
      "SELECT id FROM viviendas WHERE origen = 'local' AND origen_id = $1 LIMIT 1",
      [exp.vivienda_id]
    );
    viviendaNeonId = viv.rowCount ? Number(viv.rows[0].id) : null;
  }

  await cliente.query(
    `
      INSERT INTO expedientes_medicos (
        origen, origen_id, vivienda_id, persona_tipo, persona_id, cedula,
        paciente_nombre, comunidad, grupo_sanguineo, condiciones_cronicas,
        discapacidad, alergias, medicamentos_actuales, nivel_riesgo,
        ultima_consulta, observaciones, registrado_por, updated_at
      )
      VALUES (
        'local', $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14::date, $15, $16, now()
      )
      ON CONFLICT (origen, origen_id) DO UPDATE SET
        vivienda_id = EXCLUDED.vivienda_id,
        persona_tipo = EXCLUDED.persona_tipo,
        persona_id = EXCLUDED.persona_id,
        cedula = EXCLUDED.cedula,
        paciente_nombre = EXCLUDED.paciente_nombre,
        comunidad = EXCLUDED.comunidad,
        grupo_sanguineo = EXCLUDED.grupo_sanguineo,
        condiciones_cronicas = EXCLUDED.condiciones_cronicas,
        discapacidad = EXCLUDED.discapacidad,
        alergias = EXCLUDED.alergias,
        medicamentos_actuales = EXCLUDED.medicamentos_actuales,
        nivel_riesgo = EXCLUDED.nivel_riesgo,
        ultima_consulta = EXCLUDED.ultima_consulta,
        observaciones = EXCLUDED.observaciones,
        updated_at = now()
    `,
    [
      exp.id,
      viviendaNeonId,
      exp.persona_tipo,
      exp.persona_id,
      exp.cedula,
      exp.paciente_nombre,
      exp.comunidad,
      exp.grupo_sanguineo,
      exp.condiciones_cronicas,
      exp.discapacidad,
      exp.alergias,
      exp.medicamentos_actuales,
      exp.nivel_riesgo,
      exp.ultima_consulta || null,
      exp.observaciones,
      exp.registrado_por,
    ]
  );

  db.prepare('UPDATE expedientes_medicos SET sincronizado = 1 WHERE id = ?').run(exp.id);
}

export async function guardarExpedienteMedicoEnNeon(
  id: number
): Promise<{ ok: boolean; configurado: boolean; mensaje: string }> {
  const exp = obtenerExpedienteMedicoPorId(id);
  if (!exp) return { ok: false, configurado: false, mensaje: 'Expediente no encontrado.' };

  const cliente = crearClienteNeon();
  if (!cliente) {
    return { ok: false, configurado: false, mensaje: 'DATABASE_URL no está configurada.' };
  }

  try {
    await cliente.connect();
    await asegurarEsquema(cliente);
    await upsertExpedienteConCliente(cliente, exp);
    return { ok: true, configurado: true, mensaje: 'Expediente médico sincronizado con Neon.' };
  } catch (error: any) {
    return {
      ok: false,
      configurado: true,
      mensaje: error?.message || 'No se pudo sincronizar con Neon.',
    };
  } finally {
    await cliente.end().catch(() => {});
  }
}

export async function eliminarExpedienteMedicoEnNeon(
  id: number
): Promise<{ ok: boolean; configurado: boolean; mensaje: string }> {
  const cliente = crearClienteNeon();
  if (!cliente) {
    return { ok: false, configurado: false, mensaje: 'DATABASE_URL no está configurada.' };
  }

  try {
    await cliente.connect();
    await asegurarEsquema(cliente);
    await cliente.query(
      "DELETE FROM expedientes_medicos WHERE origen = 'local' AND origen_id = $1",
      [id]
    );
    return { ok: true, configurado: true, mensaje: 'Expediente médico eliminado de Neon.' };
  } catch (error: any) {
    return {
      ok: false,
      configurado: true,
      mensaje: error?.message || 'No se pudo eliminar de Neon.',
    };
  } finally {
    await cliente.end().catch(() => {});
  }
}

export async function sincronizarExpedientesMedicosNeon(): Promise<{
  ok: boolean;
  procesados: number;
  mensaje: string;
}> {
  const cliente = crearClienteNeon();
  if (!cliente) {
    return { ok: false, procesados: 0, mensaje: 'DATABASE_URL no está configurada.' };
  }

  try {
    await cliente.connect();
    await asegurarEsquema(cliente);

    const eliminaciones = db
      .prepare("SELECT id, origen_id FROM neon_modulos_eliminaciones WHERE tabla = 'expedientes_medicos'")
      .all() as Array<{ id: number; origen_id: number }>;

    for (const elim of eliminaciones) {
      await cliente.query(
        "DELETE FROM expedientes_medicos WHERE origen = 'local' AND origen_id = $1",
        [elim.origen_id]
      );
      db.prepare('DELETE FROM neon_modulos_eliminaciones WHERE id = ?').run(elim.id);
    }

    const pendientes = (
      db.prepare('SELECT * FROM expedientes_medicos WHERE sincronizado = 0 ORDER BY id').all() as any[]
    ).map(formatearExpediente);

    for (const exp of pendientes) {
      await upsertExpedienteConCliente(cliente, exp);
    }

    return {
      ok: true,
      procesados: pendientes.length + eliminaciones.length,
      mensaje: `Sincronización médica completada (${pendientes.length} expediente(s) subidos, ${eliminaciones.length} eliminación(es)).`,
    };
  } catch (error: any) {
    return {
      ok: false,
      procesados: 0,
      mensaje: error?.message || 'No se pudieron sincronizar los expedientes médicos.',
    };
  } finally {
    await cliente.end().catch(() => {});
  }
}
