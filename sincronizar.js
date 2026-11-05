require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { db } = require('./db');

const TAMANO_LOTE = 100;
const RUTA_ESQUEMA = path.join(__dirname, 'sql', 'neon_schema.sql');

function obtenerPendientes() {
  return db
    .prepare(`
      SELECT r.id, r.cedula, r.nombres, r.apellidos, r.fecha_registro,
             r.datos_extras, COALESCE(s.nombre, '') AS sector
      FROM registros_censo r
      LEFT JOIN sectores s ON s.id = r.sector_id
      WHERE r.sincronizado = 0
      ORDER BY r.id
    `)
    .all();
}

function construirInsercion(lote) {
  const valores = [];

  const filas = lote.map((registro, indice) => {
    const base = indice * 6;
    valores.push(
      registro.cedula,
      registro.nombres,
      registro.apellidos,
      registro.fecha_registro,
      registro.datos_extras,
      registro.sector
    );

    return `($${base + 1}, $${base + 2}, $${base + 3}, ($${base + 4})::timestamp AT TIME ZONE 'America/Caracas', ($${base + 5})::jsonb, $${base + 6})`;
  });

  const texto = `
    INSERT INTO registros_censo
      (cedula, nombres, apellidos, fecha_registro, datos_extras, sector)
    VALUES
      ${filas.join(', ')}
    ON CONFLICT (cedula) DO UPDATE SET
      nombres = EXCLUDED.nombres,
      apellidos = EXCLUDED.apellidos,
      fecha_registro = EXCLUDED.fecha_registro,
      datos_extras = EXCLUDED.datos_extras,
      sector = EXCLUDED.sector
    RETURNING cedula
  `;

  return { texto, valores };
}

const actualizarRegistro = db.prepare(`
  UPDATE registros_censo
  SET sincronizado = 1,
      sincronizado_en = datetime('now', 'localtime')
  WHERE id = ?
`);

const marcarLote = db.transaction((ids) => {
  for (const id of ids) {
    actualizarRegistro.run(id);
  }
});

async function main() {
  const cadenaConexion = process.env.DATABASE_URL;

  if (!cadenaConexion) {
    throw new Error(
      'Defina DATABASE_URL en el archivo .env con la cadena de conexión de Neon (sslmode=require).'
    );
  }

  const pendientes = obtenerPendientes();

  if (!pendientes.length) {
    console.log('No hay registros pendientes de sincronización.');
    return;
  }

  const cliente = new Client({ connectionString: cadenaConexion });
  let procesados = 0;

  try {
    await cliente.connect();
    console.log(`Conectado a Neon. Registros pendientes: ${pendientes.length}.`);

    const esquema = fs.readFileSync(RUTA_ESQUEMA, 'utf8');
    await cliente.query(esquema);

    for (let inicio = 0; inicio < pendientes.length; inicio += TAMANO_LOTE) {
      const lote = pendientes.slice(inicio, inicio + TAMANO_LOTE);
      const { texto, valores } = construirInsercion(lote);
      const numeroLote = Math.floor(inicio / TAMANO_LOTE) + 1;
      const totalLotes = Math.ceil(pendientes.length / TAMANO_LOTE);

      await cliente.query('BEGIN');

      let resultado;
      try {
        resultado = await cliente.query(texto, valores);
        await cliente.query('COMMIT');
      } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
      }

      marcarLote(lote.map((registro) => registro.id));
      procesados += resultado.rowCount;

      console.log(
        `Lote ${numeroLote}/${totalLotes}: ${lote.length} procesados, ${resultado.rowCount} sincronizados en Neon.`
      );
    }

    console.log(
      `Sincronización completada: ${procesados} registros sincronizados en Neon.`
    );
  } finally {
    await cliente.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error('No se pudo completar la sincronización:', error.message);
  process.exitCode = 1;
});
