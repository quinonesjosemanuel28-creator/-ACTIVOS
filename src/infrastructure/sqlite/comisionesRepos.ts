/**
 * CAPA 4 — INFRAESTRUCTURA · Repo de liquidaciones de comisiones.
 * Registra qué meses fueron liquidados (estado), con el id del egreso creado.
 */
import type Database from 'better-sqlite3';
import type { LiquidacionRepo, RegistroLiquidacion } from '../../application/comisiones/ports';

interface Row {
  mes: string;
  fecha_liquidacion: string;
  total_ars: number;
  total_usd: number;
  cotizacion: number | null;
  id_egreso: string;
}
const toReg = (r: Row): RegistroLiquidacion => ({
  mes: r.mes,
  fechaLiquidacion: r.fecha_liquidacion,
  totalArs: r.total_ars,
  totalUsd: r.total_usd,
  cotizacion: r.cotizacion ?? undefined,
  idEgreso: r.id_egreso,
});

export function crearLiquidacionRepo(db: Database.Database): LiquidacionRepo {
  return {
    obtener(mes) {
      const row = db.prepare('SELECT * FROM comisiones_liquidacion WHERE mes = ?').get(mes) as Row | undefined;
      return row ? toReg(row) : null;
    },
    listar() {
      return (db.prepare('SELECT * FROM comisiones_liquidacion ORDER BY mes DESC').all() as Row[]).map(toReg);
    },
    guardar(r) {
      db.prepare(
        `INSERT OR REPLACE INTO comisiones_liquidacion
         (mes, fecha_liquidacion, total_ars, total_usd, cotizacion, id_egreso)
         VALUES (@mes,@fechaLiquidacion,@totalArs,@totalUsd,@cotizacion,@idEgreso)`,
      ).run({ ...r, cotizacion: r.cotizacion ?? null });
    },
    eliminar(mes) {
      db.prepare('DELETE FROM comisiones_liquidacion WHERE mes = ?').run(mes);
    },
  };
}
