/**
 * CAPA 4 — INFRAESTRUCTURA · Asistente IA · Acceso PostgreSQL para text-to-SQL.
 *
 * - extraerEsquemaPg: tablas + columnas vía information_schema (solo nombres).
 * - ejecutarSelectPg: SEGUNDO CANDADO — corre la consulta dentro de una
 *   transacción READ ONLY: aunque el guard del dominio fallara, el motor
 *   rechaza cualquier escritura (equivalente al readonly de better-sqlite3).
 */
import { getPoolPg } from './db';
import type { TablaInfo } from '../../domain/asistente/esquema';
import type { ResultadoConsulta } from '../sqlite/asistenteDb';

export async function extraerEsquemaPg(): Promise<TablaInfo[]> {
  const pool = await getPoolPg();
  const r = await pool.query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`,
  );
  const porTabla = new Map<string, TablaInfo>();
  for (const fila of r.rows as { table_name: string; column_name: string; data_type: string }[]) {
    let t = porTabla.get(fila.table_name);
    if (!t) {
      t = { tabla: fila.table_name, columnas: [] };
      porTabla.set(fila.table_name, t);
    }
    t.columnas.push({ nombre: fila.column_name, tipo: fila.data_type.toUpperCase() });
  }
  return [...porTabla.values()];
}

export async function ejecutarSelectPg(sql: string): Promise<ResultadoConsulta> {
  const pool = await getPoolPg();
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const res = await client.query({ text: sql, rowMode: 'array' });
    await client.query('COMMIT');
    return { columnas: res.fields.map((f) => f.name), filas: res.rows as unknown[][] };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
