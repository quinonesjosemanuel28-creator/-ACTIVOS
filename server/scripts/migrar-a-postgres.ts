/**
 * Migración de datos: copia TODO el contenido de la base SQLite local
 * (data/activos.db) a PostgreSQL (DATABASE_URL). Tabla por tabla, 1:1,
 * sin transformar valores (los esquemas son espejo).
 *
 * Uso: npm run db:migrar
 *  - Requiere DATABASE_URL en el .env (no hace falta DB_DRIVER=postgres).
 *  - VACÍA las tablas destino en Postgres antes de copiar (la fuente de
 *    verdad sigue siendo SQLite hasta que cambies DB_DRIVER).
 *  - SQLite no se modifica nunca (se abre solo para leer).
 *  - Idempotente: correrlo dos veces deja Postgres igual.
 */
import 'dotenv/config';
import { getDb } from '../../src/infrastructure/sqlite/db';
import { getPoolPg, cerrarPoolPg } from '../../src/infrastructure/postgres/db';

// Orden respetando claves foráneas (cobros→ventas, pagos→cierres).
const TABLAS = [
  'ventas',
  'cobros',
  'egresos',
  'funnel',
  'parametros',
  'cierre_mes',
  'cierres',
  'pagos',
  'funnel_canal',
  'comisiones_liquidacion',
] as const;

const db = getDb();
const pool = await getPoolPg(); // corre las migraciones de esquema en PG
const client = await pool.connect();

try {
  await client.query('BEGIN');
  // Vaciar en orden inverso (hijos antes que padres).
  for (const tabla of [...TABLAS].reverse()) {
    await client.query(`DELETE FROM ${tabla}`);
  }
  for (const tabla of TABLAS) {
    const cols = (db.prepare(`PRAGMA table_info(${tabla})`).all() as { name: string }[]).map((c) => c.name);
    const filas = db.prepare(`SELECT * FROM ${tabla}`).all() as Record<string, unknown>[];
    const lista = cols.join(', ');
    const marcas = cols.map((_, i) => `$${i + 1}`).join(',');
    for (const fila of filas) {
      await client.query(`INSERT INTO ${tabla} (${lista}) VALUES (${marcas})`, cols.map((c) => fila[c] ?? null));
    }
    console.log(`[db:migrar] ${tabla}: ${filas.length} fila(s) copiadas.`);
  }
  await client.query('COMMIT');
  console.log('[db:migrar] Listo. SQLite quedó intacto; Postgres es una copia exacta.');
  console.log('[db:migrar] Verificá con: npm run db:validar');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
  await cerrarPoolPg();
}
