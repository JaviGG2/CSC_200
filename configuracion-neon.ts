import { Client } from 'pg';
import {
  db,
  crearConsejoComunal,
  listarConsejosComunales,
  listarConsejosPendientesNeon,
  marcarConsejoSincronizado,
  listarEliminacionesConsejoNeon,
  eliminarEliminacionConsejoNeon,
  listarTerritoriosPendientesNeon,
  marcarTerritorioSincronizado,
  listarEliminacionesTerritorioNeon,
  eliminarEliminacionTerritorioNeon,
  obtenerConfigSistema,
  guardarConfigSistema,
  listarConfigCampos,
  listarUsuariosConHash,
  marcarUsuarioSincronizado,
  upsertUsuarioDesdeNeon,
  listarEliminacionesUsuarioNeon,
  eliminarEliminacionUsuarioNeon,
  listarIngresosPendientesNeon,
  marcarIngresosSincronizados,
} from './db';
import { asegurarEsquema, crearClienteNeon } from './neon';

// Neon es la fuente central de la parametrización (consejos, opciones de listas,
// visibilidad/obligatoriedad de campos, territorios y usuarios). SQLite mantiene
// un espejo para que el censo siga funcionando sin conexión.

export type ResultadoConfiguracionNeon = {
  ok: boolean;
  configurado: boolean;
  mensaje: string;
};

const EXITO_MS = 5_000;
const ERROR_MS = 30_000;

let ultimaSincronizacion = 0;
let ultimoResultado: ResultadoConfiguracionNeon | null = null;
let sincronizacionEnCurso: Promise<ResultadoConfiguracionNeon> | null = null;

function detalleError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function conCliente<T>(fn: (cliente: Client) => Promise<T>): Promise<T> {
  const cliente = crearClienteNeon();
  if (!cliente) throw new Error('DATABASE_URL no está configurada.');

  try {
    await cliente.connect();
    await asegurarEsquema(cliente);
    return await fn(cliente);
  } finally {
    await cliente.end().catch(() => {});
  }
}

async function obtenerBanderaNeon(cliente: Client, clave: string): Promise<boolean> {
  const res = await cliente.query('SELECT valor FROM config_sistema WHERE clave = $1', [clave]);
  return res.rowCount ? res.rows[0].valor === '1' : false;
}

async function guardarBanderaNeon(cliente: Client, clave: string, valor = '1'): Promise<void> {
  await cliente.query(
    `INSERT INTO config_sistema (clave, valor)
     VALUES ($1, $2)
     ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, updated_at = now()`,
    [clave, valor]
  );
}

async function sembrarNeonSiEstaVacio(cliente: Client): Promise<void> {
  const consejosSembrados = await obtenerBanderaNeon(cliente, 'consejos_sembrados');
  if (!consejosSembrados) {
    const consejos = await cliente.query('SELECT COUNT(*)::int AS total FROM consejos_comunales');
    if (Number(consejos.rows[0]?.total || 0) === 0) {
      const locales = listarConsejosComunales({ soloActivos: false });
      for (const consejo of locales) {
        const yaExiste = await cliente.query(
          'SELECT 1 FROM consejos_comunales WHERE lower(nombre) = lower($1) LIMIT 1',
          [consejo.nombre]
        );
        if (!yaExiste.rowCount) {
          await cliente.query(
            `INSERT INTO consejos_comunales (nombre, sector, activo)
             VALUES ($1, $2, $3)`,
            [consejo.nombre, consejo.sector, consejo.activo]
          );
        }
      }

      if (locales.length === 0 && obtenerConfigSistema('consejos_sembrados') !== '1') {
        const comunidades = db
          .prepare("SELECT DISTINCT nombre FROM territorios WHERE tipo = 'comunidad' AND TRIM(nombre) <> ''")
          .all() as Array<{ nombre: string }>;
        for (const comunidad of comunidades) {
          const yaExiste = await cliente.query(
            'SELECT 1 FROM consejos_comunales WHERE lower(nombre) = lower($1) LIMIT 1',
            [comunidad.nombre]
          );
          if (!yaExiste.rowCount) {
            await cliente.query(
              'INSERT INTO consejos_comunales (nombre) VALUES ($1)',
              [comunidad.nombre]
            );
          }
        }
      }
    }
    await guardarBanderaNeon(cliente, 'consejos_sembrados', '1');
  }

  const opciones = await cliente.query('SELECT COUNT(*)::int AS total FROM opciones_campos');
  if (Number(opciones.rows[0]?.total || 0) === 0) {
    const locales = db
      .prepare('SELECT campo, valor, etiqueta, orden, activo FROM opciones_campos')
      .all() as any[];
    for (const opcion of locales) {
      await cliente.query(
        `INSERT INTO opciones_campos (campo, valor, etiqueta, orden, activo)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (campo, valor) DO NOTHING`,
        [opcion.campo, opcion.valor, opcion.etiqueta, opcion.orden, Boolean(opcion.activo)]
      );
    }
  }

  const config = await cliente.query('SELECT COUNT(*)::int AS total FROM config_campos_censo');
  if (Number(config.rows[0]?.total || 0) === 0) {
    for (const campo of listarConfigCampos()) {
      await cliente.query(
        `INSERT INTO config_campos_censo (clave, etiqueta, seccion, visible, requerido, orden)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (clave) DO NOTHING`,
        [campo.clave, campo.etiqueta, campo.seccion, campo.visible, campo.requerido, campo.orden]
      );
    }
  }

  const territoriosSembrados = await obtenerBanderaNeon(cliente, 'territorios_sembrados');
  if (!territoriosSembrados) {
    const territorios = await cliente.query('SELECT COUNT(*)::int AS total FROM territorios');
    if (Number(territorios.rows[0]?.total || 0) === 0) {
      const locales = db
        .prepare('SELECT id, tipo, nombre, padre_id, activo, orden FROM territorios ORDER BY id')
        .all() as any[];
      const porIdLocal = new Map<number, string>();
      for (const territorio of locales) {
        const padreNombre = territorio.padre_id ? porIdLocal.get(territorio.padre_id) : null;
        let padreIdNeon: number | null = null;
        if (padreNombre) {
          const padre = await cliente.query(
            'SELECT id FROM territorios WHERE lower(nombre) = lower($1) ORDER BY id LIMIT 1',
            [padreNombre]
          );
          padreIdNeon = padre.rowCount ? Number(padre.rows[0].id) : null;
        }
        await cliente.query(
          `INSERT INTO territorios (tipo, nombre, padre_id, activo, orden)
           VALUES ($1, $2, $3, $4, $5)`,
          [territorio.tipo, territorio.nombre, padreIdNeon, Boolean(territorio.activo), territorio.orden]
        );
        porIdLocal.set(territorio.id, territorio.nombre);
      }
    }
    await guardarBanderaNeon(cliente, 'territorios_sembrados', '1');
  }

  const usuarios = await cliente.query('SELECT COUNT(*)::int AS total FROM usuarios');
  if (Number(usuarios.rows[0]?.total || 0) === 0) {
    for (const u of listarUsuariosConHash()) {
      await cliente.query(
        `INSERT INTO usuarios (usuario, nombre, clave_hash, rol, activo)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (usuario) DO NOTHING`,
        [u.usuario.trim().toLowerCase(), u.nombre, u.clave_hash, u.rol, Boolean(u.activo)]
      );
      marcarUsuarioSincronizado(u.id);
    }
  }
}

async function upsertConsejoConCliente(
  cliente: Client,
  {
    nombre,
    nombreOriginal,
    sector,
    activo,
  }: {
    nombre: string;
    nombreOriginal?: string | null;
    sector: string | null;
    activo: boolean;
  }
): Promise<void> {
  const original = (nombreOriginal || nombre).trim();
  const existente = await cliente.query(
    'SELECT id, nombre FROM consejos_comunales WHERE lower(nombre) = lower($1) LIMIT 1',
    [original]
  );

  if (existente.rowCount) {
    await cliente.query(
      `UPDATE consejos_comunales
       SET nombre = $2, sector = $3, activo = $4, updated_at = now()
       WHERE id = $1`,
      [existente.rows[0].id, nombre, sector, activo]
    );
    if (String(existente.rows[0].nombre).toLowerCase() !== nombre.toLowerCase()) {
      await cliente.query(
        `UPDATE beneficios_entregas
         SET consejo_comunal = $2
         WHERE lower(consejo_comunal) = lower($1)`,
        [existente.rows[0].nombre, nombre]
      );
    }
    return;
  }

  const porNuevoNombre = await cliente.query(
    'SELECT id FROM consejos_comunales WHERE lower(nombre) = lower($1) LIMIT 1',
    [nombre]
  );

  if (porNuevoNombre.rowCount) {
    await cliente.query(
      `UPDATE consejos_comunales
       SET nombre = $2, sector = $3, activo = $4, updated_at = now()
       WHERE id = $1`,
      [porNuevoNombre.rows[0].id, nombre, sector, activo]
    );
  } else {
    await cliente.query(
      `INSERT INTO consejos_comunales (nombre, sector, activo)
       VALUES ($1, $2, $3)`,
      [nombre, sector, activo]
    );
  }
}

async function borrarConsejoConCliente(cliente: Client, nombre: string): Promise<void> {
  await cliente.query(
    `UPDATE viviendas
     SET consejo_comunal_id = NULL
     WHERE consejo_comunal_id IN (
       SELECT id FROM consejos_comunales WHERE lower(nombre) = lower($1)
     )`,
    [nombre]
  );
  await cliente.query('DELETE FROM consejos_comunales WHERE lower(nombre) = lower($1)', [nombre]);
}

async function aplicarConsejos(cliente: Client): Promise<number> {
  const eliminaciones = listarEliminacionesConsejoNeon();
  for (const item of eliminaciones) {
    await borrarConsejoConCliente(cliente, item.nombre);
    eliminarEliminacionConsejoNeon(item.id);
  }

  const pendientes = listarConsejosPendientesNeon();
  for (const item of pendientes) {
    await upsertConsejoConCliente(cliente, {
      nombre: item.nombre,
      nombreOriginal: item.nombre_original_neon,
      sector: item.sector,
      activo: item.activo,
    });
    marcarConsejoSincronizado(item.id);
  }

  const { rows } = await cliente.query(
    'SELECT id, nombre, sector, activo FROM consejos_comunales ORDER BY nombre'
  );

  const transaccion = db.transaction(() => {
    for (const fila of rows) {
      crearConsejoComunal({
        nombre: fila.nombre,
        sector: fila.sector,
        activo: Boolean(fila.activo),
        pendiente_neon: false,
      });
    }

    const nombresNeon = new Set(rows.map((fila: any) => String(fila.nombre).toLowerCase()));
    const locales = db
      .prepare('SELECT id, nombre FROM consejos_comunales WHERE pendiente_neon = 0')
      .all() as Array<{ id: number; nombre: string }>;
    for (const local of locales) {
      if (!nombresNeon.has(local.nombre.toLowerCase())) {
        db.prepare('UPDATE viviendas SET consejo_comunal_id = NULL WHERE consejo_comunal_id = ?').run(
          local.id
        );
        db.prepare('DELETE FROM consejos_comunales WHERE id = ?').run(local.id);
      }
    }
  });
  transaccion();
  return rows.length;
}

async function aplicarOpciones(cliente: Client): Promise<number> {
  const { rows } = await cliente.query(
    `SELECT campo, valor, etiqueta, orden, activo
     FROM opciones_campos
     ORDER BY campo, orden, valor`
  );

  const upsert = db.prepare(`
    INSERT INTO opciones_campos (campo, valor, etiqueta, orden, activo)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (campo, valor) DO UPDATE SET
      etiqueta = excluded.etiqueta,
      orden = excluded.orden,
      activo = excluded.activo
  `);

  const porCampo = new Map<string, Array<{ valor: string; etiqueta: string; orden: number; activo: number }>>();
  for (const fila of rows) {
    if (!porCampo.has(fila.campo)) porCampo.set(fila.campo, []);
    porCampo.get(fila.campo)!.push({
      valor: fila.valor,
      etiqueta: fila.etiqueta || fila.valor,
      orden: Number(fila.orden) || 0,
      activo: fila.activo ? 1 : 0,
    });
  }

  const transaccion = db.transaction(() => {
    for (const fila of rows) {
      upsert.run(
        fila.campo,
        fila.valor,
        fila.etiqueta || fila.valor,
        Number(fila.orden) || 0,
        fila.activo ? 1 : 0
      );
    }

    // Elimina espejos locales de valores que ya se quitaron en Neon.
    for (const [campo, opciones] of porCampo.entries()) {
      const valores = opciones.map((opcion) => opcion.valor);
      const marcadores = valores.map(() => '?').join(',');
      if (!marcadores) continue;
      db.prepare(`DELETE FROM opciones_campos WHERE campo = ? AND valor NOT IN (${marcadores})`).run(
        campo,
        ...valores
      );
    }
  });
  transaccion();
  return rows.length;
}

async function aplicarConfigCampos(cliente: Client): Promise<number> {
  const { rows } = await cliente.query(
    'SELECT clave, etiqueta, seccion, visible, requerido, orden FROM config_campos_censo'
  );

  const upsert = db.prepare(`
    INSERT INTO config_campos_censo (clave, etiqueta, seccion, visible, requerido, orden)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (clave) DO UPDATE SET
      etiqueta = excluded.etiqueta,
      seccion = excluded.seccion,
      visible = excluded.visible,
      requerido = excluded.requerido,
      orden = excluded.orden
  `);

  const transaccion = db.transaction(() => {
    for (const fila of rows) {
      upsert.run(
        fila.clave,
        fila.etiqueta,
        fila.seccion,
        fila.visible ? 1 : 0,
        fila.requerido ? 1 : 0,
        Number(fila.orden) || 0
      );
    }
  });
  transaccion();
  return rows.length;
}

async function upsertTerritorioConCliente(
  cliente: Client,
  {
    tipo,
    nombre,
    nombreOriginal,
    padreNombre,
    activo = true,
  }: {
    tipo: string;
    nombre: string;
    nombreOriginal?: string | null;
    padreNombre?: string | null;
    activo?: boolean;
  }
): Promise<void> {
  let padreId: number | null = null;
  if (padreNombre) {
    const padre = await cliente.query(
      'SELECT id FROM territorios WHERE lower(nombre) = lower($1) LIMIT 1',
      [padreNombre]
    );
    padreId = padre.rowCount ? Number(padre.rows[0].id) : null;
  }

  const original = (nombreOriginal || nombre).trim();
  const existente = await cliente.query(
    'SELECT id FROM territorios WHERE tipo = $1 AND lower(nombre) = lower($2) LIMIT 1',
    [tipo, original]
  );

  if (existente.rowCount) {
    await cliente.query(
      'UPDATE territorios SET nombre = $2, padre_id = $3, activo = $4 WHERE id = $1',
      [existente.rows[0].id, nombre, padreId, activo]
    );
    return;
  }

  const porNuevoNombre = await cliente.query(
    'SELECT id FROM territorios WHERE tipo = $1 AND lower(nombre) = lower($2) LIMIT 1',
    [tipo, nombre]
  );

  if (porNuevoNombre.rowCount) {
    await cliente.query(
      'UPDATE territorios SET nombre = $2, padre_id = $3, activo = $4 WHERE id = $1',
      [porNuevoNombre.rows[0].id, nombre, padreId, activo]
    );
  } else {
    const maxOrden = await cliente.query(
      'SELECT COALESCE(MAX(orden), 0)::int + 10 AS siguiente FROM territorios WHERE tipo = $1',
      [tipo]
    );
    const siguienteOrden = Number(maxOrden.rows[0]?.siguiente || 10);
    await cliente.query(
      `INSERT INTO territorios (tipo, nombre, padre_id, activo, orden)
       VALUES ($1, $2, $3, $4, $5)`,
      [tipo, nombre, padreId, activo, siguienteOrden]
    );
  }
}

async function aplicarTerritorios(cliente: Client): Promise<number> {
  const eliminaciones = listarEliminacionesTerritorioNeon();
  for (const item of eliminaciones) {
    await cliente.query(
      'DELETE FROM territorios WHERE tipo = $1 AND lower(nombre) = lower($2)',
      [item.tipo, item.nombre]
    );
    eliminarEliminacionTerritorioNeon(item.id);
  }

  const pendientes = listarTerritoriosPendientesNeon();
  for (const item of pendientes) {
    await upsertTerritorioConCliente(cliente, {
      tipo: item.tipo,
      nombre: item.nombre,
      nombreOriginal: item.nombre_original_neon,
      padreNombre: item.padre_nombre,
      activo: item.activo,
    });
    marcarTerritorioSincronizado(item.id);
  }

  const { rows } = await cliente.query(
    `SELECT t.tipo, t.nombre, t.activo, t.orden, p.nombre AS padre_nombre
     FROM territorios t
     LEFT JOIN territorios p ON p.id = t.padre_id
     ORDER BY t.orden, t.nombre`
  );

  const transaccion = db.transaction(() => {
    const clavesNeon = new Set<string>();

    for (const fila of rows) {
      clavesNeon.add(`${fila.tipo}:${String(fila.nombre).toLowerCase()}`);

      let padreId: number | null = null;
      if (fila.padre_nombre) {
        const padre = db
          .prepare('SELECT id FROM territorios WHERE lower(nombre) = lower(?) LIMIT 1')
          .get(fila.padre_nombre) as { id: number } | undefined;
        padreId = padre ? padre.id : null;
      }

      const existente = db
        .prepare(
          'SELECT id FROM territorios WHERE tipo = ? AND lower(nombre) = lower(?) LIMIT 1'
        )
        .get(fila.tipo, fila.nombre) as { id: number } | undefined;

      if (existente) {
        db.prepare(
          'UPDATE territorios SET padre_id = ?, activo = ?, orden = ?, pendiente_neon = 0, nombre_original_neon = NULL WHERE id = ?'
        ).run(padreId, fila.activo ? 1 : 0, Number(fila.orden) || 0, existente.id);
        continue;
      }

      db.prepare(
        'INSERT INTO territorios (tipo, nombre, padre_id, activo, orden, pendiente_neon, nombre_original_neon) VALUES (?, ?, ?, ?, ?, 0, NULL)'
      ).run(fila.tipo, fila.nombre, padreId, fila.activo ? 1 : 0, Number(fila.orden) || 0);
    }

    const locales = db
      .prepare('SELECT id, tipo, nombre FROM territorios WHERE pendiente_neon = 0')
      .all() as Array<{ id: number; tipo: string; nombre: string }>;
    for (const local of locales) {
      if (!clavesNeon.has(`${local.tipo}:${local.nombre.toLowerCase()}`)) {
        db.prepare('DELETE FROM territorios WHERE id = ?').run(local.id);
      }
    }
  });
  transaccion();
  return rows.length;
}

async function aplicarUsuarios(cliente: Client): Promise<number> {
  const eliminaciones = listarEliminacionesUsuarioNeon();
  for (const item of eliminaciones) {
    await cliente.query('DELETE FROM usuarios WHERE lower(usuario) = lower($1)', [item.usuario]);
    eliminarEliminacionUsuarioNeon(item.id);
  }

  const localesPendientes = listarUsuariosConHash().filter(
    (u) => !u.sincronizado || u.pendiente_neon
  );
  for (const u of localesPendientes) {
    const limpio = u.usuario.trim().toLowerCase();
    const existente = await cliente.query(
      'SELECT id FROM usuarios WHERE lower(usuario) = lower($1) LIMIT 1',
      [limpio]
    );

    if (existente.rowCount) {
      if (u.pendiente_neon) {
        await cliente.query(
          `UPDATE usuarios
           SET usuario = $2, nombre = $3, clave_hash = $4, rol = $5, activo = $6
           WHERE id = $1`,
          [existente.rows[0].id, limpio, u.nombre, u.clave_hash, u.rol, Boolean(u.activo)]
        );
      }
    } else {
      await cliente.query(
        `INSERT INTO usuarios (usuario, nombre, clave_hash, rol, activo)
         VALUES ($1, $2, $3, $4, $5)`,
        [limpio, u.nombre, u.clave_hash, u.rol, Boolean(u.activo)]
      );
    }
    marcarUsuarioSincronizado(u.id);
  }

  const { rows } = await cliente.query(
    `SELECT usuario, nombre, clave_hash, rol, activo, creado_en::text AS creado_en
     FROM usuarios
     ORDER BY id`
  );

  const nombresNeon = new Set(rows.map((fila: any) => String(fila.usuario).trim().toLowerCase()));
  const transaccion = db.transaction(() => {
    for (const fila of rows) {
      upsertUsuarioDesdeNeon({
        usuario: fila.usuario,
        nombre: fila.nombre,
        clave_hash: fila.clave_hash,
        rol: fila.rol === 'admin' ? 'admin' : 'gestor',
        activo: Boolean(fila.activo),
        creado_en: fila.creado_en ? String(fila.creado_en).slice(0, 19).replace('T', ' ') : null,
      });
    }

    const localesSincronizados = db
      .prepare('SELECT id, usuario, rol, activo FROM usuarios WHERE sincronizado = 1 AND pendiente_neon = 0')
      .all() as Array<{ id: number; usuario: string; rol: string; activo: number }>;
    for (const local of localesSincronizados) {
      if (!nombresNeon.has(local.usuario.trim().toLowerCase())) {
        if (local.rol === 'admin' && local.activo) {
          const { total } = db
            .prepare("SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'admin' AND activo = 1")
            .get() as { total: number };
          if (total <= 1) continue;
        }
        db.prepare('DELETE FROM usuarios WHERE id = ?').run(local.id);
      }
    }
  });
  transaccion();
  return rows.length;
}

async function aplicarIngresos(cliente: Client): Promise<number> {
  const pendientes = listarIngresosPendientesNeon();
  const sincronizados: number[] = [];

  for (const ingreso of pendientes) {
    const limpio = ingreso.usuario.trim().toLowerCase();
    const uRes = await cliente.query(
      'SELECT id FROM usuarios WHERE lower(usuario) = lower($1) LIMIT 1',
      [limpio]
    );
    const usuarioIdNeon = uRes.rowCount ? Number(uRes.rows[0].id) : null;

    await cliente.query(
      `INSERT INTO ingresos_sistema (usuario_id, usuario, nombre, rol, modulo, fecha_ingreso)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
      [
        usuarioIdNeon,
        limpio,
        ingreso.nombre,
        ingreso.rol === 'admin' ? 'admin' : 'gestor',
        ingreso.modulo || 'portal',
        ingreso.fecha_ingreso,
      ]
    );

    if (usuarioIdNeon) {
      await cliente.query(
        `UPDATE usuarios
         SET total_ingresos = COALESCE(total_ingresos, 0) + 1,
             ultimo_ingreso = GREATEST(ultimo_ingreso, $2::timestamptz),
             ultima_actividad = GREATEST(ultima_actividad, $3::timestamptz)
         WHERE id = $1`,
        [usuarioIdNeon, ingreso.fecha_ingreso, ingreso.fecha_ingreso]
      );
    }

    sincronizados.push(ingreso.id);
  }

  marcarIngresosSincronizados(sincronizados);
  return sincronizados.length;
}

async function aplicarRegistrosDesdeNeon(cliente: Client): Promise<number> {
  const { rows } = await cliente.query(
    'SELECT id, cedula, nombres, apellidos, fecha_nacimiento, datos_extras FROM registros_censo'
  );

  const neonIdsPresentes = new Set<number>();

  const transaccion = db.transaction(() => {
    for (const fila of rows) {
      const neonId = Number(fila.id);
      neonIdsPresentes.add(neonId);
      const datos = (fila.datos_extras || {}) as any;
      const comunidad = datos.comunidad || 'Carabobo 200';
      const etapa = datos.etapa || null;
      const manzana = datos.manzana || null;
      const direccion = datos.direccion || 'S/D';
      const numeroCasa = datos.numero_casa || null;
      const fechaRegistro = datos.fecha_registro_vivienda || fila.fecha_nacimiento || new Date().toISOString();

      let viviendaId: number | null = null;
      const existenteNeon = db.prepare('SELECT id FROM viviendas WHERE neon_id = ?').get(neonId) as { id: number } | undefined;
      if (existenteNeon) {
        viviendaId = existenteNeon.id;
        db.prepare(`
          UPDATE viviendas SET comunidad = ?, etapa = ?, manzana = ?, direccion = ?, numero_casa = ?, sincronizado = 1
          WHERE id = ?
        `).run(comunidad, etapa, manzana, direccion, numeroCasa, viviendaId);
      } else {
        const resViv = db.prepare(`
          INSERT INTO viviendas (comunidad, etapa, manzana, direccion, numero_casa, fecha_registro, sincronizado, neon_id)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `).run(comunidad, etapa, manzana, direccion, numeroCasa, fechaRegistro, neonId);
        viviendaId = Number(resViv.lastInsertRowid);
      }

      if (viviendaId && datos.jefe) {
        const j = datos.jefe;
        const cedulaCompleta = String(j.cedula || fila.cedula || 'V-00000000');
        const matchVE = /^([VES])-?(.*)$/i.exec(cedulaCompleta);
        const cedulaTipo = (matchVE ? matchVE[1].toUpperCase() : 'V') as any;
        const cedulaNumero = matchVE ? matchVE[2].trim() : cedulaCompleta;

        const existentePorCedula = db.prepare('SELECT id, vivienda_id FROM jefes_familia WHERE cedula_tipo = ? AND cedula_numero = ?').get(cedulaTipo, cedulaNumero) as { id: number; vivienda_id: number } | undefined;
        if (existentePorCedula && existentePorCedula.vivienda_id !== viviendaId) {
          db.prepare('DELETE FROM jefes_familia WHERE id = ?').run(existentePorCedula.id);
        }

        const existenteJefe = db.prepare('SELECT id FROM jefes_familia WHERE vivienda_id = ?').get(viviendaId) as { id: number } | undefined;
        if (existenteJefe) {
          db.prepare(`
            UPDATE jefes_familia SET cedula_tipo = ?, cedula_numero = ?, nombres = ?, apellidos = ?, fecha_nacimiento = ?, sexo = ?, telefono_movil = ?, telefono_habitacion = ?, telefono_trabajo = ?, correo = ?, nivel_instruccion = ?, estado_civil = ?, profesion = ?, trabaja_actual = ?, clasificacion_ingresos = ?, frecuencia_ingresos = ?
            WHERE id = ?
          `).run(
            cedulaTipo, cedulaNumero, j.nombres || fila.nombres, j.apellidos || fila.apellidos,
            j.fecha_nacimiento || '1900-01-01', j.sexo || 'M', j.telefono_movil || null,
            j.telefono_habitacion || null, j.telefono_trabajo || null, j.correo || null,
            j.nivel_instruccion || 'Primaria', j.estado_civil || 'Soltero/a', j.profesion || null,
            j.trabaja_actual || 'No', j.clasificacion_ingresos || 'Mensual', j.frecuencia_ingresos || null,
            existenteJefe.id
          );
        } else {
          db.prepare(`
            INSERT INTO jefes_familia (vivienda_id, cedula_tipo, cedula_numero, nombres, apellidos, fecha_nacimiento, sexo, telefono_movil, telefono_habitacion, telefono_trabajo, correo, nivel_instruccion, estado_civil, profesion, trabaja_actual, clasificacion_ingresos, frecuencia_ingresos)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            viviendaId, cedulaTipo, cedulaNumero, j.nombres || fila.nombres, j.apellidos || fila.apellidos,
            j.fecha_nacimiento || '1900-01-01', j.sexo || 'M', j.telefono_movil || null,
            j.telefono_habitacion || null, j.telefono_trabajo || null, j.correo || null,
            j.nivel_instruccion || 'Primaria', j.estado_civil || 'Soltero/a', j.profesion || null,
            j.trabaja_actual || 'No', j.clasificacion_ingresos || 'Mensual', j.frecuencia_ingresos || null
          );
        }
      }

      if (viviendaId && Array.isArray(datos.integrantes)) {
        db.prepare('DELETE FROM integrantes_grupo_familiar WHERE vivienda_id = ?').run(viviendaId);
        for (const [idx, integ] of datos.integrantes.entries()) {
          const cedulaInteg = String(integ.cedula || '');
          const matchInteg = /^([VES])-?(.*)$/i.exec(cedulaInteg);
          const iTipo = matchInteg ? matchInteg[1].toUpperCase() : null;
          const iNum = matchInteg ? matchInteg[2].trim() : (cedulaInteg || null);

          db.prepare(`
            INSERT INTO integrantes_grupo_familiar (vivienda_id, numero, apellidos, nombres, cedula_tipo, cedula_numero, fecha_nacimiento, sexo, parentesco, nivel_instruccion, profesion)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            viviendaId, Number(integ.numero || idx + 1), integ.apellidos || '', integ.nombres || '',
            iTipo, iNum, integ.fecha_nacimiento || null, integ.sexo || null,
            integ.parentesco || 'Otro', integ.nivel_instruccion || null, integ.profesion || null
          );
        }
      }
    }

    const todasLocales = db.prepare('SELECT id, neon_id FROM viviendas WHERE neon_id IS NOT NULL').all() as Array<{ id: number; neon_id: number }>;
    for (const loc of todasLocales) {
      if (!neonIdsPresentes.has(loc.neon_id)) {
        db.prepare('DELETE FROM viviendas WHERE id = ?').run(loc.id);
      }
    }
  });
  transaccion();
  return rows.length;
}

async function ejecutarSincronizacion(): Promise<ResultadoConfiguracionNeon> {
  try {
    const resultado = await conCliente(async (cliente) => {
      await sembrarNeonSiEstaVacio(cliente);
      const consejos = await aplicarConsejos(cliente);
      const opciones = await aplicarOpciones(cliente);
      const campos = await aplicarConfigCampos(cliente);
      const territorios = await aplicarTerritorios(cliente);
      const usuarios = await aplicarUsuarios(cliente);
      await aplicarIngresos(cliente);
      const registros = await aplicarRegistrosDesdeNeon(cliente);

      const asistenteNeon = await cliente.query(
        'SELECT valor FROM config_sistema WHERE clave = $1 LIMIT 1',
        ['asistente_habilitado']
      );
      if (asistenteNeon.rowCount) {
        const valorNeon = String(asistenteNeon.rows[0].valor) === '0' ? '0' : '1';
        guardarConfigSistema('asistente_habilitado', valorNeon);
      }

      return { consejos, opciones, campos, territorios, usuarios, registros };
    });

    return {
      ok: true,
      configurado: true,
      mensaje: `Configuración sincronizada desde Neon (${resultado.consejos} consejos, ${resultado.opciones} opciones, ${resultado.campos} campos, ${resultado.usuarios} usuarios).`,
    };
  } catch (error) {
    return {
      ok: false,
      configurado: Boolean(process.env.DATABASE_URL),
      mensaje: `No se pudo sincronizar la configuración con Neon: ${detalleError(error)}`,
    };
  }
}

// Refresca el espejo local con una caché corta para no castigar cada petición.
export async function sincronizarConfiguracionNeon({
  forzar = false,
}: { forzar?: boolean } = {}): Promise<ResultadoConfiguracionNeon> {
  if (sincronizacionEnCurso) return sincronizacionEnCurso;

  const ahora = Date.now();
  if (!forzar && ultimoResultado) {
    const ttl = ultimoResultado.ok ? EXITO_MS : ERROR_MS;
    if (ahora - ultimaSincronizacion < ttl) return ultimoResultado;
  }

  sincronizacionEnCurso = ejecutarSincronizacion()
    .then((resultado) => {
      ultimoResultado = resultado;
      ultimaSincronizacion = Date.now();
      return resultado;
    })
    .finally(() => {
      sincronizacionEnCurso = null;
    });

  return sincronizacionEnCurso;
}

export function invalidarCacheConfiguracion(): void {
  ultimaSincronizacion = 0;
  ultimoResultado = null;
}

// ---------------------------------------------------------------------------
// Escrituras administrativas: primero Neon, luego el espejo local.
// ---------------------------------------------------------------------------

export async function guardarConsejoEnNeon({
  nombre,
  nombreOriginal,
  sector,
  activo,
}: {
  nombre: string;
  nombreOriginal?: string | null;
  sector: string | null;
  activo: boolean;
}): Promise<ResultadoConfiguracionNeon> {
  try {
    await conCliente(async (cliente) => {
      await upsertConsejoConCliente(cliente, { nombre, nombreOriginal, sector, activo });
    });

    invalidarCacheConfiguracion();
    return { ok: true, configurado: true, mensaje: 'Consejo comunal guardado en Neon.' };
  } catch (error) {
    return {
      ok: false,
      configurado: Boolean(process.env.DATABASE_URL),
      mensaje: `No se pudo guardar el consejo en Neon: ${detalleError(error)}`,
    };
  }
}

export async function eliminarConsejoEnNeon(
  nombre: string
): Promise<ResultadoConfiguracionNeon> {
  try {
    await conCliente(async (cliente) => {
      await borrarConsejoConCliente(cliente, nombre);
    });
    invalidarCacheConfiguracion();
    return { ok: true, configurado: true, mensaje: 'Consejo comunal eliminado de Neon.' };
  } catch (error) {
    return {
      ok: false,
      configurado: Boolean(process.env.DATABASE_URL),
      mensaje: `No se pudo eliminar el consejo de Neon: ${detalleError(error)}`,
    };
  }
}

export async function guardarOpcionEnNeon({
  campo,
  valor,
  valorOriginal,
  etiqueta,
  orden,
  activo,
}: {
  campo: string;
  valor: string;
  valorOriginal?: string;
  etiqueta: string | null;
  orden: number;
  activo: boolean;
}): Promise<ResultadoConfiguracionNeon> {
  try {
    await conCliente(async (cliente) => {
      const original = valorOriginal || valor;
      const existente = await cliente.query(
        'SELECT id FROM opciones_campos WHERE campo = $1 AND lower(valor) = lower($2) LIMIT 1',
        [campo, original]
      );

      if (existente.rowCount) {
        await cliente.query(
          `UPDATE opciones_campos
           SET valor = $2, etiqueta = $3, orden = $4, activo = $5, updated_at = now()
           WHERE id = $1`,
          [existente.rows[0].id, valor, etiqueta, orden, activo]
        );
      } else {
        await cliente.query(
          `INSERT INTO opciones_campos (campo, valor, etiqueta, orden, activo)
           VALUES ($1, $2, $3, $4, $5)`,
          [campo, valor, etiqueta, orden, activo]
        );
      }
    });

    invalidarCacheConfiguracion();
    return { ok: true, configurado: true, mensaje: 'Opción guardada en Neon.' };
  } catch (error) {
    return {
      ok: false,
      configurado: Boolean(process.env.DATABASE_URL),
      mensaje: `No se pudo guardar la opción en Neon: ${detalleError(error)}`,
    };
  }
}

export async function cambiarEstadoOpcionEnNeon(
  campo: string,
  valor: string
): Promise<ResultadoConfiguracionNeon> {
  try {
    await conCliente(async (cliente) => {
      await cliente.query(
        `UPDATE opciones_campos
         SET activo = NOT activo, updated_at = now()
         WHERE campo = $1 AND valor = $2`,
        [campo, valor]
      );
    });
    invalidarCacheConfiguracion();
    return { ok: true, configurado: true, mensaje: 'Estado de la opción actualizado en Neon.' };
  } catch (error) {
    return {
      ok: false,
      configurado: Boolean(process.env.DATABASE_URL),
      mensaje: `No se pudo actualizar la opción en Neon: ${detalleError(error)}`,
    };
  }
}

export async function eliminarOpcionEnNeon(
  campo: string,
  valor: string
): Promise<ResultadoConfiguracionNeon> {
  try {
    await conCliente(async (cliente) => {
      await cliente.query('DELETE FROM opciones_campos WHERE campo = $1 AND valor = $2', [
        campo,
        valor,
      ]);
    });
    invalidarCacheConfiguracion();
    return { ok: true, configurado: true, mensaje: 'Opción eliminada de Neon.' };
  } catch (error) {
    return {
      ok: false,
      configurado: Boolean(process.env.DATABASE_URL),
      mensaje: `No se pudo eliminar la opción en Neon: ${detalleError(error)}`,
    };
  }
}

export async function guardarConfigCamposEnNeon(
  campos: Array<{
    clave: string;
    etiqueta: string;
    seccion: string;
    visible: boolean;
    requerido: boolean;
    orden: number;
  }>
): Promise<ResultadoConfiguracionNeon> {
  try {
    await conCliente(async (cliente) => {
      for (const campo of campos) {
        await cliente.query(
          `INSERT INTO config_campos_censo (clave, etiqueta, seccion, visible, requerido, orden)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (clave) DO UPDATE SET
             etiqueta = excluded.etiqueta,
             seccion = excluded.seccion,
             visible = excluded.visible,
             requerido = excluded.requerido,
             orden = excluded.orden`,
          [
            campo.clave,
            campo.etiqueta,
            campo.seccion,
            campo.visible,
            campo.requerido,
            campo.orden,
          ]
        );
      }
    });
    invalidarCacheConfiguracion();
    return { ok: true, configurado: true, mensaje: 'Configuración del formulario guardada en Neon.' };
  } catch (error) {
    return {
      ok: false,
      configurado: Boolean(process.env.DATABASE_URL),
      mensaje: `No se pudo guardar la configuración en Neon: ${detalleError(error)}`,
    };
  }
}

export async function eliminarTerritorioEnNeon({
  tipo,
  nombre,
}: {
  tipo: string;
  nombre: string;
}): Promise<ResultadoConfiguracionNeon> {
  try {
    await conCliente(async (cliente) => {
      await cliente.query(
        'DELETE FROM territorios WHERE tipo = $1 AND lower(nombre) = lower($2)',
        [tipo, nombre]
      );
    });
    invalidarCacheConfiguracion();
    return { ok: true, configurado: true, mensaje: 'Territorio eliminado de Neon.' };
  } catch (error) {
    return {
      ok: false,
      configurado: Boolean(process.env.DATABASE_URL),
      mensaje: `No se pudo eliminar el territorio de Neon: ${detalleError(error)}`,
    };
  }
}

export async function guardarTerritorioEnNeon({
  tipo,
  nombre,
  nombreOriginal,
  padreNombre,
  activo = true,
}: {
  tipo: string;
  nombre: string;
  nombreOriginal?: string | null;
  padreNombre?: string | null;
  activo?: boolean;
}): Promise<ResultadoConfiguracionNeon> {
  try {
    await conCliente(async (cliente) => {
      await upsertTerritorioConCliente(cliente, {
        tipo,
        nombre,
        nombreOriginal,
        padreNombre,
        activo,
      });
    });
    invalidarCacheConfiguracion();
    return { ok: true, configurado: true, mensaje: 'Territorio guardado en Neon.' };
  } catch (error) {
    return {
      ok: false,
      configurado: Boolean(process.env.DATABASE_URL),
      mensaje: `No se pudo guardar el territorio en Neon: ${detalleError(error)}`,
    };
  }
}

export async function guardarUsuarioEnNeon({
  usuario,
  nombre,
  clave_hash,
  rol,
  activo = true,
}: {
  usuario: string;
  nombre: string;
  clave_hash: string;
  rol: 'admin' | 'gestor';
  activo?: boolean;
}): Promise<ResultadoConfiguracionNeon> {
  try {
    const limpio = usuario.trim().toLowerCase();
    const rolValido: 'admin' | 'gestor' = rol === 'admin' ? 'admin' : 'gestor';

    await conCliente(async (cliente) => {
      const existente = await cliente.query(
        'SELECT id FROM usuarios WHERE lower(usuario) = lower($1) LIMIT 1',
        [limpio]
      );

      if (existente.rowCount) {
        await cliente.query(
          `UPDATE usuarios
           SET usuario = $2, nombre = $3, clave_hash = $4, rol = $5, activo = $6
           WHERE id = $1`,
          [existente.rows[0].id, limpio, nombre, clave_hash, rolValido, Boolean(activo)]
        );
      } else {
        await cliente.query(
          `INSERT INTO usuarios (usuario, nombre, clave_hash, rol, activo)
           VALUES ($1, $2, $3, $4, $5)`,
          [limpio, nombre, clave_hash, rolValido, Boolean(activo)]
        );
      }
    });

    invalidarCacheConfiguracion();
    return { ok: true, configurado: true, mensaje: 'Usuario guardado en Neon.' };
  } catch (error) {
    return {
      ok: false,
      configurado: Boolean(process.env.DATABASE_URL),
      mensaje: `No se pudo guardar el usuario en Neon: ${detalleError(error)}`,
    };
  }
}

export async function eliminarUsuarioEnNeon(
  usuario: string
): Promise<ResultadoConfiguracionNeon> {
  try {
    const limpio = usuario.trim().toLowerCase();
    await conCliente(async (cliente) => {
      await cliente.query('DELETE FROM usuarios WHERE lower(usuario) = lower($1)', [limpio]);
    });
    invalidarCacheConfiguracion();
    return { ok: true, configurado: true, mensaje: 'Usuario eliminado de Neon.' };
  } catch (error) {
    return {
      ok: false,
      configurado: Boolean(process.env.DATABASE_URL),
      mensaje: `No se pudo eliminar el usuario de Neon: ${detalleError(error)}`,
    };
  }
}

export async function guardarConfigSistemaEnNeon(
  clave: string,
  valor: string
): Promise<ResultadoConfiguracionNeon> {
  try {
    await conCliente(async (cliente) => {
      await guardarBanderaNeon(cliente, clave, valor);
    });
    invalidarCacheConfiguracion();
    return { ok: true, configurado: true, mensaje: 'Ajuste guardado en Neon.' };
  } catch (error) {
    return {
      ok: false,
      configurado: Boolean(process.env.DATABASE_URL),
      mensaje: `Ajuste guardado localmente (pendiente en Neon): ${detalleError(error)}`,
    };
  }
}
