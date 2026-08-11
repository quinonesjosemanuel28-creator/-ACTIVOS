/**
 * Test estructural: las listas de tablas de los scripts de datos no pueden
 * quedar desactualizadas respecto del esquema. Cada tabla nueva tiene que
 * declararse en TABLAS (db:migrar la copia) o en TABLAS_NO_COPIADAS (con su
 * porqué). Si este test falla al agregar un módulo, la solución es decidir
 * a qué lista va la tabla — no borrar el test.
 *
 * De paso verifica la disciplina de espejo: SQLite y PostgreSQL declaran
 * exactamente las mismas tablas.
 */
import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { SCHEMA_SQL_PG } from '../postgres/schema';
import { TABLAS, TABLAS_NO_COPIADAS } from '../../../server/scripts/tablas';

/** Tablas reales del esquema SQLite (el resultado de migrar(), no el texto). */
function tablasSqlite(): Set<string> {
  const db = getDbMemoria();
  const filas = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  return new Set(filas.map((f) => f.name));
}

/** Tablas declaradas en el esquema PostgreSQL (parsea el DDL). */
function tablasPg(): Set<string> {
  const nombres = [...SCHEMA_SQL_PG.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]!);
  return new Set(nombres);
}

describe('Esquema · listas de tablas de los scripts de datos', () => {
  it('SQLite y PostgreSQL declaran exactamente las mismas tablas (espejo)', () => {
    expect([...tablasSqlite()].sort()).toEqual([...tablasPg()].sort());
  });

  it('toda tabla del esquema está en TABLAS o en TABLAS_NO_COPIADAS, sin solaparse', () => {
    const declaradas = [...TABLAS, ...TABLAS_NO_COPIADAS];
    expect(new Set(declaradas).size).toBe(declaradas.length); // sin duplicados entre listas
    expect([...declaradas].sort()).toEqual([...tablasPg()].sort());
  });
});
