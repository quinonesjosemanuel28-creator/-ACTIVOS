/**
 * CAPA 4 — INFRAESTRUCTURA · Conexión PostgreSQL (pg.Pool).
 *
 * Se activa con DB_DRIVER=postgres + DATABASE_URL en el .env (local o
 * Railway). El pool es un singleton; al crearlo corre las migraciones.
 */
import pg from 'pg';
import { sslPostgres, urlPostgres } from '../db/factory';
import { migrarPg } from './schema';

let pool: pg.Pool | null = null;

export async function getPoolPg(): Promise<pg.Pool> {
  if (pool) return pool;
  const nuevo = new pg.Pool({ connectionString: urlPostgres(), ssl: sslPostgres() });
  await migrarPg(nuevo);
  pool = nuevo;
  return pool;
}

/** Cierra el pool (scripts y tests; el server vive hasta que lo maten). */
export async function cerrarPoolPg(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
