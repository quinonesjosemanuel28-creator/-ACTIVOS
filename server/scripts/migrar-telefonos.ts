/**
 * Migración de UNA pasada (ticket 7C): parte el `whatsapp` libre de las
 * fichas en telefono_pais / telefono_numero, sobre la base que diga DB_DRIVER
 * (SQLite local o Postgres vía DATABASE_URL — para producción, igual que
 * db:validar: PGSSL=true DATABASE_URL=… npm run db:migrar-telefonos).
 *
 * - Idempotente: correrlo dos veces no toca lo ya migrado.
 * - NO adivina: el número sin marca internacional clara queda para revisión
 *   manual y se lista al final (adivinar mal = escribirle a un desconocido).
 * - No borra nada: el campo whatsapp original queda como estaba.
 */
import 'dotenv/config';
import { crearInfraestructura } from '../../src/infrastructure/db/conexion';
import { migrarTelefonos } from '../../src/application/alumnos/useCases';
import { cerrarPoolPg } from '../../src/infrastructure/postgres/db';

const infra = await crearInfraestructura();
console.log(`[telefonos] base: ${infra.driver}`);

const r = await migrarTelefonos(infra.reposAlumnos);

console.log(`[telefonos] migrados: ${r.migrados} · ya migrados (sin tocar): ${r.yaMigrados}`);
if (r.sinMigrar.length === 0) {
  console.log('[telefonos] ✔ ningún teléfono quedó pendiente de revisión.');
} else {
  console.log(`[telefonos] ⚠ ${r.sinMigrar.length} sin migrar — cargarlos a mano desde la ficha:`);
  for (const s of r.sinMigrar) console.log(`  · ${s.nombre}: "${s.whatsapp}"`);
}

if (infra.driver === 'postgres') await cerrarPoolPg();
