/**
 * CAPA 4 — INFRAESTRUCTURA · Repo del funnel por canal (tabla funnel_canal).
 * No toca la tabla `funnel` legacy ni los cierres.
 */
import type Database from 'better-sqlite3';
import type { CanalFila, FunnelCanalRepo } from '../../application/funnel/ports';

interface Row {
  canal: string;
  agendas: number;
  asistieron: number;
}

export function crearFunnelCanalRepo(db: Database.Database): FunnelCanalRepo {
  return {
    listarPorMes(mes) {
      return (db.prepare('SELECT canal, agendas, asistieron FROM funnel_canal WHERE mes = ? ORDER BY canal').all(mes) as Row[]).map(
        (r): CanalFila => ({ canal: r.canal, agendas: r.agendas, asistieron: r.asistieron }),
      );
    },
    guardarMes(mes, filas) {
      const stmt = db.prepare(
        `INSERT OR REPLACE INTO funnel_canal (mes, canal, agendas, asistieron) VALUES (?,?,?,?)`,
      );
      const tx = db.transaction((items: CanalFila[]) => {
        for (const f of items) stmt.run(mes, f.canal, f.agendas, f.asistieron);
      });
      tx(filas);
    },
    vaciar() {
      return db.prepare('DELETE FROM funnel_canal').run().changes;
    },
  };
}
