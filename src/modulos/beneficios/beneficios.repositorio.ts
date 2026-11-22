import {
  db,
  asegurarEsquema,
  crearClienteNeon,
  listarConsejosComunales,
} from '../../nucleo/base-datos';

export type EstadoBeneficio = 'Entregado' | 'Pendiente' | 'Programado';
export type TipoEntregaBeneficio = 'Única' | 'Mensual' | 'Quincenal' | 'Periódica';

export type EntregaBeneficio = {
  id: number;
  vivienda_id: number | null;
  persona_tipo: 'jefe' | 'integrante' | null;
  persona_id: number | null;
  cedula: string | null;
  beneficiario_nombre: string;
  consejo_comunal: string | null;
  comunidad: string | null;
  programa: string;
  tipo_entrega: TipoEntregaBeneficio;
  cantidad: string | null;
  estado: EstadoBeneficio;
  fecha_entrega: string;
  observaciones: string | null;
  registrado_por: string | null;
  sincronizado: boolean;
  creado_en: string;
};

export type BeneficiarioCompartido = {
  tipo: 'jefe' | 'integrante';
  persona_id: number;
  vivienda_id: number;
  cedula: string | null;
  nombres: string;
  apellidos: string;
  comunidad: string;
  consejo_comunal: string | null;
};

function formatearBeneficio(fila: any): EntregaBeneficio {
  return {
    id: fila.id,
    vivienda_id: fila.vivienda_id ?? null,
    persona_tipo: fila.persona_tipo ?? null,
    persona_id: fila.persona_id ?? null,
    cedula: fila.cedula ?? null,
    beneficiario_nombre: fila.beneficiario_nombre,
    consejo_comunal: fila.consejo_comunal ?? null,
    comunidad: fila.comunidad ?? null,
    programa: fila.programa,
    tipo_entrega: (fila.tipo_entrega as TipoEntregaBeneficio) || 'Única',
    cantidad: fila.cantidad ?? null,
    estado: (fila.estado as EstadoBeneficio) || 'Entregado',
    fecha_entrega: fila.fecha_entrega,
    observaciones: fila.observaciones ?? null,
    registrado_por: fila.registrado_por ?? null,
    sincronizado: Boolean(fila.sincronizado),
    creado_en: fila.creado_en,
  };
}

export function listarEntregasBeneficios({
  q = '',
  programa = '',
  consejo = '',
  estado = '',
}: {
  q?: string;
  programa?: string;
  consejo?: string;
  estado?: string;
} = {}): EntregaBeneficio[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.trim()) {
    const like = `%${q.trim()}%`;
    where.push(
      '(beneficiario_nombre LIKE ? OR cedula LIKE ? OR programa LIKE ? OR comunidad LIKE ? OR consejo_comunal LIKE ?)'
    );
    params.push(like, like, like, like, like);
  }
  if (programa) {
    where.push('programa = ?');
    params.push(programa);
  }
  if (consejo) {
    where.push('consejo_comunal = ?');
    params.push(consejo);
  }
  if (estado) {
    where.push('estado = ?');
    params.push(estado);
  }

  const condicion = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const filas = db
    .prepare(`
      SELECT * FROM beneficios_entregas
      ${condicion}
      ORDER BY fecha_entrega DESC, id DESC
    `)
    .all(...params) as any[];

  return filas.map(formatearBeneficio);
}

export function obtenerEntregaBeneficioPorId(id: number): EntregaBeneficio | null {
  const fila = db.prepare('SELECT * FROM beneficios_entregas WHERE id = ?').get(id) as any;
  return fila ? formatearBeneficio(fila) : null;
}

export function obtenerEstadisticasBeneficios(): {
  total: number;
  entregados: number;
  pendientes: number;
  viviendasAtendidas: number;
  pendientesSync: number;
} {
  const fila = db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN estado = 'Entregado' THEN 1 ELSE 0 END), 0) AS entregados,
        COALESCE(SUM(CASE WHEN estado IN ('Pendiente', 'Programado') THEN 1 ELSE 0 END), 0) AS pendientes,
        COUNT(DISTINCT COALESCE(CAST(vivienda_id AS TEXT), beneficiario_nombre)) AS viviendasAtendidas,
        COALESCE(SUM(CASE WHEN sincronizado = 0 THEN 1 ELSE 0 END), 0) AS pendientesSync
      FROM beneficios_entregas
    `)
    .get() as any;

  return {
    total: Number(fila?.total || 0),
    entregados: Number(fila?.entregados || 0),
    pendientes: Number(fila?.pendientes || 0),
    viviendasAtendidas: Number(fila?.viviendasAtendidas || 0),
    pendientesSync: Number(fila?.pendientesSync || 0),
  };
}

export function listarBeneficiariosCompartidos(): BeneficiarioCompartido[] {
  return db
    .prepare(`
      SELECT
        p.tipo,
        p.persona_id,
        p.vivienda_id,
        p.cedula,
        p.nombres,
        p.apellidos,
        p.comunidad,
        COALESCE(c.nombre, p.comunidad) AS consejo_comunal
      FROM vista_personas_individuales p
      JOIN viviendas v ON v.id = p.vivienda_id
      LEFT JOIN consejos_comunales c ON c.id = v.consejo_comunal_id
      ORDER BY p.apellidos COLLATE NOCASE, p.nombres COLLATE NOCASE
    `)
    .all() as BeneficiarioCompartido[];
}

export function listarConsejosParaBeneficios() {
  return listarConsejosComunales({ soloActivos: true });
}

export function crearEntregaBeneficio(datos: {
  vivienda_id?: number | null;
  persona_tipo?: 'jefe' | 'integrante' | null;
  persona_id?: number | null;
  cedula?: string | null;
  beneficiario_nombre: string;
  consejo_comunal?: string | null;
  comunidad?: string | null;
  programa: string;
  tipo_entrega: TipoEntregaBeneficio;
  cantidad?: string | null;
  estado: EstadoBeneficio;
  fecha_entrega: string;
  observaciones?: string | null;
  registrado_por?: string | null;
}): number {
  const res = db
    .prepare(`
      INSERT INTO beneficios_entregas (
        vivienda_id, persona_tipo, persona_id, cedula, beneficiario_nombre,
        consejo_comunal, comunidad, programa, tipo_entrega, cantidad,
        estado, fecha_entrega, observaciones, registrado_por, sincronizado
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `)
    .run(
      datos.vivienda_id ?? null,
      datos.persona_tipo ?? null,
      datos.persona_id ?? null,
      datos.cedula ?? null,
      datos.beneficiario_nombre,
      datos.consejo_comunal ?? null,
      datos.comunidad ?? null,
      datos.programa,
      datos.tipo_entrega,
      datos.cantidad ?? null,
      datos.estado,
      datos.fecha_entrega,
      datos.observaciones ?? null,
      datos.registrado_por ?? null
    );
  return Number(res.lastInsertRowid);
}

export function actualizarEstadoBeneficio(id: number, estado: EstadoBeneficio): boolean {
  return (
    db
      .prepare('UPDATE beneficios_entregas SET estado = ?, sincronizado = 0 WHERE id = ?')
      .run(estado, id).changes > 0
  );
}

export function eliminarEntregaBeneficio(id: number): boolean {
  return db.prepare('DELETE FROM beneficios_entregas WHERE id = ?').run(id).changes > 0;
}

export function encolarEliminacionBeneficioNeon(origenId: number): void {
  db.prepare(`
    INSERT INTO neon_modulos_eliminaciones (tabla, origen_id)
    VALUES ('beneficios_entregas', ?)
    ON CONFLICT (tabla, origen_id) DO NOTHING
  `).run(origenId);
}

async function upsertBeneficioConCliente(cliente: any, entrega: EntregaBeneficio): Promise<void> {
  let viviendaNeonId: number | null = null;
  if (entrega.vivienda_id) {
    const viv = await cliente.query(
      "SELECT id FROM viviendas WHERE origen = 'local' AND origen_id = $1 LIMIT 1",
      [entrega.vivienda_id]
    );
    viviendaNeonId = viv.rowCount ? Number(viv.rows[0].id) : null;
  }

  await cliente.query(
    `
      INSERT INTO beneficios_entregas (
        origen, origen_id, vivienda_id, persona_tipo, persona_id, cedula,
        beneficiario_nombre, consejo_comunal, comunidad, programa, tipo_entrega,
        cantidad, estado, fecha_entrega, observaciones, registrado_por, updated_at
      )
      VALUES (
        'local', $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13::date, $14, $15, now()
      )
      ON CONFLICT (origen, origen_id) DO UPDATE SET
        vivienda_id = EXCLUDED.vivienda_id,
        persona_tipo = EXCLUDED.persona_tipo,
        persona_id = EXCLUDED.persona_id,
        cedula = EXCLUDED.cedula,
        beneficiario_nombre = EXCLUDED.beneficiario_nombre,
        consejo_comunal = EXCLUDED.consejo_comunal,
        comunidad = EXCLUDED.comunidad,
        programa = EXCLUDED.programa,
        tipo_entrega = EXCLUDED.tipo_entrega,
        cantidad = EXCLUDED.cantidad,
        estado = EXCLUDED.estado,
        fecha_entrega = EXCLUDED.fecha_entrega,
        observaciones = EXCLUDED.observaciones,
        updated_at = now()
    `,
    [
      entrega.id,
      viviendaNeonId,
      entrega.persona_tipo,
      entrega.persona_id,
      entrega.cedula,
      entrega.beneficiario_nombre,
      entrega.consejo_comunal,
      entrega.comunidad,
      entrega.programa,
      entrega.tipo_entrega,
      entrega.cantidad,
      entrega.estado,
      entrega.fecha_entrega,
      entrega.observaciones,
      entrega.registrado_por,
    ]
  );

  db.prepare('UPDATE beneficios_entregas SET sincronizado = 1 WHERE id = ?').run(entrega.id);
}

export async function guardarBeneficioEnNeon(
  id: number
): Promise<{ ok: boolean; configurado: boolean; mensaje: string }> {
  const entrega = obtenerEntregaBeneficioPorId(id);
  if (!entrega) return { ok: false, configurado: false, mensaje: 'Entrega no encontrada.' };

  const cliente = crearClienteNeon();
  if (!cliente) {
    return { ok: false, configurado: false, mensaje: 'DATABASE_URL no está configurada.' };
  }

  try {
    await cliente.connect();
    await asegurarEsquema(cliente);
    await upsertBeneficioConCliente(cliente, entrega);
    return { ok: true, configurado: true, mensaje: 'Entrega sincronizada con Neon.' };
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

export async function eliminarBeneficioEnNeon(
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
      "DELETE FROM beneficios_entregas WHERE origen = 'local' AND origen_id = $1",
      [id]
    );
    return { ok: true, configurado: true, mensaje: 'Entrega eliminada de Neon.' };
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

export async function sincronizarBeneficiosNeon(): Promise<{
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
      .prepare("SELECT id, origen_id FROM neon_modulos_eliminaciones WHERE tabla = 'beneficios_entregas'")
      .all() as Array<{ id: number; origen_id: number }>;

    for (const elim of eliminaciones) {
      await cliente.query(
        "DELETE FROM beneficios_entregas WHERE origen = 'local' AND origen_id = $1",
        [elim.origen_id]
      );
      db.prepare('DELETE FROM neon_modulos_eliminaciones WHERE id = ?').run(elim.id);
    }

    const pendientes = (
      db.prepare('SELECT * FROM beneficios_entregas WHERE sincronizado = 0 ORDER BY id').all() as any[]
    ).map(formatearBeneficio);

    for (const entrega of pendientes) {
      await upsertBeneficioConCliente(cliente, entrega);
    }

    return {
      ok: true,
      procesados: pendientes.length + eliminaciones.length,
      mensaje: `Sincronización de beneficios completada (${pendientes.length} entrega(s) subidas, ${eliminaciones.length} eliminación(es)).`,
    };
  } catch (error: any) {
    return {
      ok: false,
      procesados: 0,
      mensaje: error?.message || 'No se pudieron sincronizar las entregas de beneficios.',
    };
  } finally {
    await cliente.end().catch(() => {});
  }
}
