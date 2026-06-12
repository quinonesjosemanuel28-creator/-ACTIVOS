/**
 * CAPA 4 — INFRAESTRUCTURA · Repo de liquidaciones de comisiones (PostgreSQL).
 * Espejo de src/infrastructure/sqlite/comisionesRepos.ts.
 */
import type { Pool } from 'pg';
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

export function crearLiquidacionRepoPg(pool: Pool): LiquidacionRepo {
  return {
    async obtener(mes) {
      const r = await pool.query('SELECT * FROM comisiones_liquidacion WHERE mes = $1', [mes]);
      const row = r.rows[0] as Row | undefined;
      return row ? toReg(row) : null;
    },
    async listar() {
      const r = await pool.query('SELECT * FROM comisiones_liquidacion ORDER BY mes DESC');
      return (r.rows as Row[]).map(toReg);
    },
    async guardar(reg) {
      await pool.query(
        `INSERT INTO comisiones_liquidacion
         (mes, fecha_liquidacion, total_ars, total_usd, cotizacion, id_egreso)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (mes) DO UPDATE SET
          fecha_liquidacion=EXCLUDED.fecha_liquidacion, total_ars=EXCLUDED.total_ars,
          total_usd=EXCLUDED.total_usd, cotizacion=EXCLUDED.cotizacion, id_egreso=EXCLUDED.id_egreso`,
        [reg.mes, reg.fechaLiquidacion, reg.totalArs, reg.totalUsd, reg.cotizacion ?? null, reg.idEgreso],
      );
    },
    async eliminar(mes) {
      await pool.query('DELETE FROM comisiones_liquidacion WHERE mes = $1', [mes]);
    },
  };
}
