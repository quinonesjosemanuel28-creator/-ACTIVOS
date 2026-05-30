/**
 * CAPA 4 — INFRAESTRUCTURA · Repo CRUD del módulo Egresos.
 * Opera sobre la MISMA tabla `egresos` que el dashboard (única fuente).
 * El repo legacy de egresos (crearRepositorios) queda intacto.
 */
import type Database from 'better-sqlite3';
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

export function crearEgresosAdminRepo(db: Database.Database): EgresosAdminRepo {
  return {
    obtener(id) {
      const row = db.prepare('SELECT * FROM egresos WHERE id_egreso = ?').get(id) as EgresoRow | undefined;
      return row ? toEgreso(row) : null;
    },
    listarTodos() {
      return (db.prepare('SELECT * FROM egresos ORDER BY fecha DESC').all() as EgresoRow[]).map(toEgreso);
    },
    guardar(e) {
      db.prepare(
        `INSERT OR REPLACE INTO egresos
         (id_egreso, fecha, mes, tipo, categoria, concepto, monto_usd, monto_ars, cotizacion,
          recurrente, medio_pago, comentarios, programa, unidad_negocio)
         VALUES (@idEgreso,@fecha,@mes,@tipo,@categoria,@concepto,@montoUsd,@montoArs,@cotizacion,
          @recurrente,@medioPago,@comentarios,@programa,@unidadNegocio)`,
      ).run({
        ...e,
        concepto: e.concepto ?? null,
        montoArs: e.montoArs ?? null,
        cotizacion: e.cotizacion ?? null,
        recurrente: e.recurrente ? 1 : 0,
        medioPago: e.medioPago ?? null,
        comentarios: e.comentarios ?? null,
        programa: e.programa ?? null,
      });
    },
    eliminar(id) {
      db.prepare('DELETE FROM egresos WHERE id_egreso = ?').run(id);
    },
  };
}
