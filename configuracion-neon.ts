import { Client } from 'pg';
import {
  db,
  crearConsejoComunal,
  listarConsejosComunales,
  listarConfigCampos,
} from './db';
import { crearClienteNeon } from './neon';

// Neon es la fuente central de la parametrización (consejos, opciones de listas,
// visibilidad/obligatoriedad de campos y territorios). SQLite mantiene un espejo
// para que el censo siga funcionando sin conexión.

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
    return await fn(cliente);
  } finally {
    await cliente.end().catch(() => {});
  }
}

async function sembrarNeonSiEstaVacio(cliente: Client): Promise<void> {
  const consejos = await cliente.query('SELECT COUNT(*)::int AS total FROM consejos_comunales');
  if (Number(consejos.rows[0]?.total || 0) === 0) {
    const locales = listarConsejosComunales({ soloActivos: false });
    for (const consejo of locales) {
      await cliente.query(
        `INSERT INTO consejos_comunales (nombre, sector, activo)
         SELECT $1::text, $2::text, $3::boolean
         WHERE NOT EXISTS (
           SELECT 1 FROM consejos_comunales WHERE lower(nombre) = lower($1::text)
         )`,
        [consejo.nombre, consejo.sector, consejo.activo]
      );
    }

    // Si tampoco había consejos locales, se derivan de las comunidades.
    const comunidades = db
      .prepare("SELECT DISTINCT nombre FROM territorios WHERE tipo = 'comunidad' AND TRIM(nombre) <> ''")
      .all() as Array<{ nombre: string }>;
    for (const comunidad of comunidades) {
      await cliente.query(
        `INSERT INTO consejos_comunales (nombre)
         SELECT $1::text
         WHERE NOT EXISTS (
           SELECT 1 FROM consejos_comunales WHERE lower(nombre) = lower($1::text)
         )`,
        [comunidad.nombre]
      );
    }
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

  const territorios = await cliente.query('SELECT COUNT(*)::int AS total FROM territorios');
  if (Number(territorios.rows[0]?.total || 0) === 0) {
    const locales = db
      .prepare('SELECT tipo, nombre, padre_id, activo, orden FROM territorios ORDER BY id')
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
}

async function aplicarConsejos(cliente: Client): Promise<number> {
  const { rows } = await cliente.query(
    'SELECT id, nombre, sector, activo FROM consejos_comunales ORDER BY nombre'
  );

  const transaccion = db.transaction(() => {
    for (const fila of rows) {
      crearConsejoComunal({
        nombre: fila.nombre,
        sector: fila.sector,
        activo: Boolean(fila.activo),
      });
    }

    // Lo que ya no exista en Neon deja de ofrecerse en el formulario.
    const nombresNeon = new Set(rows.map((fila: any) => String(fila.nombre).toLowerCase()));
    const locales = db
      .prepare('SELECT id, nombre, activo FROM consejos_comunales WHERE activo = 1')
      .all() as Array<{ id: number; nombre: string; activo: number }>;
    for (const local of locales) {
      if (!nombresNeon.has(local.nombre.toLowerCase())) {
        db.prepare('UPDATE consejos_comunales SET activo = 0 WHERE id = ?').run(local.id);
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

async function aplicarTerritorios(cliente: Client): Promise<number> {
  const { rows } = await cliente.query(
    `SELECT t.tipo, t.nombre, t.activo, t.orden, p.nombre AS padre_nombre
     FROM territorios t
     LEFT JOIN territorios p ON p.id = t.padre_id
     ORDER BY t.orden, t.nombre`
  );

  const transaccion = db.transaction(() => {
    for (const fila of rows) {
      const existente = db
        .prepare(
          'SELECT id FROM territorios WHERE tipo = ? AND lower(nombre) = lower(?) LIMIT 1'
        )
        .get(fila.tipo, fila.nombre) as { id: number } | undefined;

      if (existente) {
        db.prepare('UPDATE territorios SET activo = ?, orden = ? WHERE id = ?').run(
          fila.activo ? 1 : 0,
          Number(fila.orden) || 0,
          existente.id
        );
        continue;
      }

      let padreId: number | null = null;
      if (fila.padre_nombre) {
        const padre = db
          .prepare('SELECT id FROM territorios WHERE lower(nombre) = lower(?) LIMIT 1')
          .get(fila.padre_nombre) as { id: number } | undefined;
        padreId = padre ? padre.id : null;
      }

      db.prepare(
        'INSERT INTO territorios (tipo, nombre, padre_id, activo, orden) VALUES (?, ?, ?, ?, ?)'
      ).run(fila.tipo, fila.nombre, padreId, fila.activo ? 1 : 0, Number(fila.orden) || 0);
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
      return { consejos, opciones, campos, territorios };
    });

    return {
      ok: true,
      configurado: true,
      mensaje: `Configuración sincronizada desde Neon (${resultado.consejos} consejos, ${resultado.opciones} opciones, ${resultado.campos} campos).`,
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
      if (!resultado.ok) console.error('[config-neon]', resultado.mensaje);
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
  sector,
  activo,
}: {
  nombre: string;
  sector: string | null;
  activo: boolean;
}): Promise<ResultadoConfiguracionNeon> {
  try {
    await conCliente(async (cliente) => {
      const existente = await cliente.query(
        'SELECT id FROM consejos_comunales WHERE lower(nombre) = lower($1) LIMIT 1',
        [nombre]
      );

      if (existente.rowCount) {
        await cliente.query(
          `UPDATE consejos_comunales
           SET nombre = $2, sector = $3, activo = $4, updated_at = now()
           WHERE id = $1`,
          [existente.rows[0].id, nombre, sector, activo]
        );
      } else {
        await cliente.query(
          `INSERT INTO consejos_comunales (nombre, sector, activo)
           VALUES ($1, $2, $3)`,
          [nombre, sector, activo]
        );
      }
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
  padreNombre,
  activo = true,
}: {
  tipo: string;
  nombre: string;
  padreNombre?: string | null;
  activo?: boolean;
}): Promise<ResultadoConfiguracionNeon> {
  try {
    await conCliente(async (cliente) => {
      let padreId: number | null = null;
      if (padreNombre) {
        const padre = await cliente.query(
          'SELECT id FROM territorios WHERE lower(nombre) = lower($1) LIMIT 1',
          [padreNombre]
        );
        padreId = padre.rowCount ? Number(padre.rows[0].id) : null;
      }

      const existente = await cliente.query(
        'SELECT id FROM territorios WHERE tipo = $1 AND lower(nombre) = lower($2) LIMIT 1',
        [tipo, nombre]
      );

      if (existente.rowCount) {
        await cliente.query(
          'UPDATE territorios SET nombre = $2, padre_id = $3, activo = $4 WHERE id = $1',
          [existente.rows[0].id, nombre, padreId, activo]
        );
      } else {
        await cliente.query(
          `INSERT INTO territorios (tipo, nombre, padre_id, activo, orden)
           VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(orden), 0) + 10 FROM territorios WHERE tipo = $1))`,
          [tipo, nombre, padreId, activo]
        );
      }
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
