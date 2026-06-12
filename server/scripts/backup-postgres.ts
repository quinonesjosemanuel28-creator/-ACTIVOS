/**
 * Backup de la base PostgreSQL a un archivo .sql fechado, con pg_dump.
 *
 * Uso: npm run db:backup
 *  - Requiere DATABASE_URL en el entorno (la de Railway o la local).
 *  - Requiere pg_dump instalado (viene con PostgreSQL; en Mac: brew install
 *    postgresql@16). Es SOLO LECTURA sobre la base: no la modifica.
 *  - Escribe backups/activos-YYYY-MM-DD-HHmm.sql (carpeta en .gitignore) y
 *    deja una copia FUERA de Railway, en tu poder. Restaurar:
 *      psql "$DATABASE_URL" -f backups/activos-XXXX.sql
 *
 * Pensado para correr a mano (semanal y antes de cada import grande) o
 * agendado con cron en tu Mac.
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { urlPostgres } from '../../src/infrastructure/db/factory';

const url = urlPostgres(); // lanza un error claro si falta DATABASE_URL

const ahora = new Date();
const sello = ahora.toISOString().slice(0, 16).replace('T', '-').replace(':', '');
const dir = resolve(process.cwd(), 'backups');
mkdirSync(dir, { recursive: true });
const destino = resolve(dir, `activos-${sello}.sql`);

console.log(`[db:backup] Volcando la base a ${destino} …`);

// --no-owner / --no-privileges → el dump restaura limpio en otra instancia
// (p. ej. de Railway a tu local) sin depender de roles específicos.
const r = spawnSync('pg_dump', ['--no-owner', '--no-privileges', '-f', destino, url], {
  stdio: ['ignore', 'inherit', 'inherit'],
});

if (r.error && (r.error as NodeJS.ErrnoException).code === 'ENOENT') {
  console.error('[db:backup] ✘ No encontré "pg_dump". Instalá PostgreSQL (Mac: brew install postgresql@16).');
  process.exit(1);
}
if (r.status !== 0) {
  console.error(`[db:backup] ✘ pg_dump terminó con código ${r.status}.`);
  process.exit(r.status ?? 1);
}

console.log('[db:backup] ✔ Backup completo.');
console.log(`[db:backup] Restaurar: psql "$DATABASE_URL" -f ${destino}`);
