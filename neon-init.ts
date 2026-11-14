import dotenv from 'dotenv';

dotenv.config({ quiet: true });

import { inicializarEsquemaNeon } from './neon';

// Crea/verifica en Neon todas las tablas que usa el sistema.
async function main() {
  const resultado = await inicializarEsquemaNeon();
  console.log(resultado.mensaje);

  if (!resultado.configurado || !resultado.ok) {
    process.exitCode = 1;
  }
}

main();
