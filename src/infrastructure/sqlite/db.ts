/**
 * CAPA 4 — INFRAESTRUCTURA · Conexión SQLite (better-sqlite3).
 * Motor de verdad, no Excel. Corre 100% local.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { migrar } from './schema';

let instancia: Database.Database | null = null;

export function getDb(rutaArg?: string): Database.Database {
  if (instancia) return instancia;
  const ruta = rutaArg ?? resolve(process.cwd(), 'data', 'activos.db');
  mkdirSync(dirname(ruta), { recursive: true });
  const db = new Database(ruta);
  db.pragma('journal_mode = WAL');
  migrar(db);
  instancia = db;
  return db;
}

/** Crea una base en memoria (tests / seed efímero). */
export function getDbMemoria(): Database.Database {
  const db = new Database(':memory:');
  migrar(db);
  return db;
}
