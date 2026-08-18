/**
 * Restauración de un backup .sql (pg_dump) sobre la base de DATABASE_URL —
 * con el ensayo integrado: no alcanza con que psql termine sin error.
 *
 * Uso: npm run db:restaurar -- backups/activos-FECHA.sql [--pisar]
 *  - La base destino tiene que estar VACÍA. Si tiene tablas, el script se
 *    niega salvo con --pisar, que primero borra el esquema entero — es el
 *    camino de desastre ("se vacía la base y se vuelve a copiar"), no el
 *    de todos los días.
 *  - Después de restaurar corre las migraciones (lo mismo que hace la app
 *    al arrancar) y compara las filas de cada tabla contra las que el dump
 *    declara. Verde acá = ese backup sirve para volver.
 *
 * Lo usa también el workflow de backup (.github/workflows/backup.yml): cada
 * backup nocturno se restaura en un Postgres descartable en el mismo run.
 * Una restauración que nunca se ensayó no es un backup, es una esperanza.
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { sslPostgres, urlPostgres } from '../../src/infrastructure/db/factory';
import { migrarPg } from '../../src/infrastructure/postgres/schema';
import { filasPorTablaDelDump } from './dumpSql';

const args = process.argv.slice(2);
const pisar = args.includes('--pisar');
const archivo = args.find((a) => !a.startsWith('--'));

if (!archivo) {
  console.error('Uso: npm run db:restaurar -- backups/activos-FECHA.sql [--pisar]');
  process.exit(1);
}

const rutaDump: string = archivo; // ya validado: dentro de main() TS no ve la guarda de arriba
const url = urlPostgres(); // error claro si falta DATABASE_URL
const destino = new URL(url).host; // host:puerto, sin credenciales
const esperadas = filasPorTablaDelDump(readFileSync(rutaDump, 'utf8'));

async function main(): Promise<void> {
  // 1. La base destino tiene que estar vacía (o pisarse a sabiendas).
  const cliente = new pg.Client({ connectionString: url, ssl: sslPostgres() });
  await cliente.connect();
  const { rows } = await cliente.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  const tablasExistentes = rows[0]!.n;
  if (tablasExistentes > 0 && !pisar) {
    console.error(
      `[db:restaurar] ✘ La base destino (${destino}) ya tiene ${tablasExistentes} tablas. ` +
        'Restaurar acá BORRA lo que hay. Si es exactamente lo que querés, repetí con --pisar.',
    );
    await cliente.end();
    process.exit(1);
  }
  if (tablasExistentes > 0) {
    console.log(`[db:restaurar] ⚠ --pisar: borrando el esquema de ${destino} (${tablasExistentes} tablas)…`);
    await cliente.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }
  await cliente.end();

  // 2. Restaurar con psql, cortando al primer error.
  console.log(`[db:restaurar] Restaurando ${rutaDump} sobre ${destino} …`);
  const r = spawnSync('psql', ['--quiet', '-v', 'ON_ERROR_STOP=1', '-f', rutaDump, url], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (r.error && (r.error as NodeJS.ErrnoException).code === 'ENOENT') {
    console.error('[db:restaurar] ✘ No encontré "psql". Instalá PostgreSQL (Mac: brew install postgresql@16).');
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`[db:restaurar] ✘ psql terminó con código ${r.status}: la restauración quedó a medias.`);
    process.exit(r.status ?? 1);
  }

  // 3. Las migraciones sobre lo restaurado: exactamente lo que va a hacer la
  //    app al arrancar. Si esto falla, la app tampoco iba a levantar.
  console.log('[db:restaurar] Corriendo las migraciones sobre lo restaurado…');
  const pool = new pg.Pool({ connectionString: url, ssl: sslPostgres() });
  await migrarPg(pool);

  // 4. Fila por tabla contra lo que el dump declara.
  let diferencias = 0;
  for (const [tabla, filasEsperadas] of [...esperadas.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const res = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${tabla}"`);
    const filasReales = res.rows[0]!.n;
    if (filasReales === filasEsperadas) {
      console.log(`[db:restaurar]   ✔ ${tabla}: ${filasReales} filas`);
    } else {
      console.error(`[db:restaurar]   ✘ ${tabla}: el dump declara ${filasEsperadas} filas y la base tiene ${filasReales}`);
      diferencias++;
    }
  }
  await pool.end();

  if (diferencias > 0) {
    console.error(`[db:restaurar] ✘ ${diferencias} tabla(s) no coinciden con el dump. Este backup NO está probado.`);
    process.exit(1);
  }
  console.log(`[db:restaurar] ✔ Restauración completa y verificada: ${esperadas.size} tablas, migraciones ok.`);
}

main().catch((e) => {
  console.error('[db:restaurar] ✘', e instanceof Error ? e.message : e);
  process.exit(1);
});
