/**
 * CAPA 4 — INFRAESTRUCTURA · Asistente IA · Acceso a la DB para text-to-SQL.
 *
 * - extraerEsquema: lista tablas + columnas (solo nombres, sin datos).
 * - ejecutarSelect: SEGUNDO CANDADO — abre la base en modo READONLY y exige
 *   que la sentencia preparada sea un reader. Aunque el guard del dominio
 *   fallara, el motor rechaza cualquier escritura.
 */
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import type { TablaInfo } from '../../domain/asistente/esquema';

const rutaDb = () => resolve(process.cwd(), 'data', 'activos.db');

/** Lee tablas y columnas con sqlite_master + PRAGMA table_info. */
export function extraerEsquema(): TablaInfo[] {
  const db = new Database(rutaDb(), { readonly: true });
  try {
    const tablas = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[];
    return tablas.map((t) => {
      const cols = db.prepare(`PRAGMA table_info(${t.name})`).all() as { name: string; type: string }[];
      return { tabla: t.name, columnas: cols.map((c) => ({ nombre: c.name, tipo: c.type || 'TEXT' })) };
    });
  } finally {
    db.close();
  }
}

export interface ResultadoConsulta {
  columnas: string[];
  filas: unknown[][];
}

/**
 * Ejecuta una SELECT en modo SOLO LECTURA. La conexión es readonly: cualquier
 * intento de escritura lanza error a nivel motor. Además se verifica que la
 * sentencia preparada sea `reader`. Devuelve columnas + filas (acotadas afuera).
 */
export function ejecutarSelect(sql: string): ResultadoConsulta {
  const db = new Database(rutaDb(), { readonly: true });
  try {
    const stmt = db.prepare(sql);
    if (!stmt.reader) {
      throw new Error('La sentencia no es de solo lectura.');
    }
    stmt.raw(true); // filas como arrays
    const filas = stmt.all() as unknown[][];
    const columnas = stmt.columns().map((c) => c.name);
    return { columnas, filas };
  } finally {
    db.close();
  }
}
