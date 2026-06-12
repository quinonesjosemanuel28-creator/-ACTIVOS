/**
 * CAPA 4 — INFRAESTRUCTURA · Repo CRUD de Egresos sobre PostgreSQL.
 * Espejo de src/infrastructure/sqlite/egresosRepos.ts (misma tabla `egresos`).
 */
import type { Pool } from 'pg';
import type { Egreso, Programa, TipoEgreso, UnidadNegocio } from '../../domain/types';
import type { EgresosAdminRepo } from '../../application/egresos/ports';

interface EgresoRow {
  id_egreso: string;
  fecha: string;
  mes: string;
  tipo: string;
  categoria: string;
  concepto: string | null;
  monto_usd: number;
  monto_ars: number | null;
  cotizacion: number | null;
  recurrente: number | null;
  medio_pago: string | null;
  comentarios: string | null;
  programa: string | null;
  unidad_negocio: string;
}

const toEgreso = (r: EgresoRow): Egreso => ({
  idEgreso: r.id_egreso,
  fecha: r.fecha,
  mes: r.mes,
  tipo: r.tipo as TipoEgreso,
  categoria: r.categoria,
  concepto: r.concepto ?? undefined,
  montoUsd: r.monto_usd,
  montoArs: r.monto_ars ?? undefined,
  cotizacion: r.cotizacion ?? undefined,
  recurrente: r.recurrente === 1,
  medioPago: r.medio_pago ?? undefined,
  comentarios: r.comentarios ?? undefined,
  programa: (r.programa as Programa | null) ?? undefined,
  unidadNegocio: r.unidad_negocio as UnidadNegocio,
});

export function crearEgresosAdminRepoPg(pool: Pool): EgresosAdminRepo {
  return {
    async obtener(id) {
      const r = await pool.query('SELECT * FROM egresos WHERE id_egreso = $1', [id]);
      const row = r.rows[0] as EgresoRow | undefined;
      return row ? toEgreso(row) : null;
    },
    async listarTodos() {
      const r = await pool.query('SELECT * FROM egresos ORDER BY fecha DESC');
      return (r.rows as EgresoRow[]).map(toEgreso);
    },
    async guardar(e) {
      await pool.query(
        `INSERT INTO egresos
         (id_egreso, fecha, mes, tipo, categoria, concepto, monto_usd, monto_ars, cotizacion,
          recurrente, medio_pago, comentarios, programa, unidad_negocio)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id_egreso) DO UPDATE SET
          fecha=EXCLUDED.fecha, mes=EXCLUDED.mes, tipo=EXCLUDED.tipo, categoria=EXCLUDED.categoria,
          concepto=EXCLUDED.concepto, monto_usd=EXCLUDED.monto_usd, monto_ars=EXCLUDED.monto_ars,
          cotizacion=EXCLUDED.cotizacion, recurrente=EXCLUDED.recurrente, medio_pago=EXCLUDED.medio_pago,
          comentarios=EXCLUDED.comentarios, programa=EXCLUDED.programa, unidad_negocio=EXCLUDED.unidad_negocio`,
        [e.idEgreso, e.fecha, e.mes, e.tipo, e.categoria, e.concepto ?? null, e.montoUsd,
         e.montoArs ?? null, e.cotizacion ?? null, e.recurrente ? 1 : 0, e.medioPago ?? null,
         e.comentarios ?? null, e.programa ?? null, e.unidadNegocio],
      );
    },
    async eliminar(id) {
      await pool.query('DELETE FROM egresos WHERE id_egreso = $1', [id]);
    },
  };
}
