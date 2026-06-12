/**
 * CAPA 4 — INFRAESTRUCTURA · Repo del funnel por canal (PostgreSQL).
 * Espejo de src/infrastructure/sqlite/funnelCanalRepos.ts.
 */
import type { Pool } from 'pg';
import type { CanalFila, FunnelCanalRepo } from '../../application/funnel/ports';

interface Row {
  canal: string;
  agendas: number;
  asistieron: number;
}

export function crearFunnelCanalRepoPg(pool: Pool): FunnelCanalRepo {
  return {
    async listarPorMes(mes) {
      const r = await pool.query(
        'SELECT canal, agendas, asistieron FROM funnel_canal WHERE mes = $1 ORDER BY canal',
        [mes],
      );
      return (r.rows as Row[]).map((f): CanalFila => ({ canal: f.canal, agendas: f.agendas, asistieron: f.asistieron }));
    },
    async guardarMes(mes, filas) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const f of filas) {
          await client.query(
            `INSERT INTO funnel_canal (mes, canal, agendas, asistieron) VALUES ($1,$2,$3,$4)
             ON CONFLICT (mes, canal) DO UPDATE SET agendas=EXCLUDED.agendas, asistieron=EXCLUDED.asistieron`,
            [mes, f.canal, f.agendas, f.asistieron],
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    async vaciar() {
      const r = await pool.query('DELETE FROM funnel_canal');
      return r.rowCount ?? 0;
    },
  };
}
