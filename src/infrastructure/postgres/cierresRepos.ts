/**
 * CAPA 4 — INFRAESTRUCTURA · Repositorios PostgreSQL del módulo Cierres y Clientes.
 * Espejo de src/infrastructure/sqlite/cierresRepos.ts con pg ($1..$n,
 * ON CONFLICT DO UPDATE — nunca REPLACE, que dispararía el cascade de pagos).
 */
import type { Pool } from 'pg';
import type {
  Cierre,
  EstadoCierre,
  MedioPago,
  Pago,
  ProgramaCierre,
  TipoPago,
} from '../../domain/cierres/types';
import type { UnidadNegocio } from '../../domain/types';
import type { CierresRepo, FiltrosCierres, PagosRepo, ReposCierres } from '../../application/cierres/ports';
import { DEMO_PREFIX } from '../sqlite/cierresRepos';

// ───────────────────────── Mapeo de filas ─────────────────────────

interface CierreRow {
  id_cierre: string;
  fecha_cierre: string;
  cliente_nombre: string;
  cliente_mail: string | null;
  cliente_telefono: string | null;
  programa: string;
  ticket_total_usd: number;
  closer: string | null;
  setter: string | null;
  funnel: string | null;
  referido: string | null;
  comentarios: string | null;
  unidad_negocio: string;
  estado: string;
  revisar: string | null;
  cantidad_cuotas: number | null;
  monto_cuota_usd: number | null;
  fecha_primera_cuota: string | null;
  inactivo: number | null;
}
const toCierre = (r: CierreRow): Cierre => ({
  idCierre: r.id_cierre,
  fechaCierre: r.fecha_cierre,
  clienteNombre: r.cliente_nombre,
  clienteMail: r.cliente_mail ?? undefined,
  clienteTelefono: r.cliente_telefono ?? undefined,
  programa: r.programa as ProgramaCierre,
  ticketTotalUsd: r.ticket_total_usd,
  closer: r.closer ?? undefined,
  setter: r.setter ?? undefined,
  funnel: r.funnel ?? undefined,
  referido: r.referido ?? undefined,
  comentarios: r.comentarios ?? undefined,
  unidadNegocio: r.unidad_negocio as UnidadNegocio,
  estado: r.estado as EstadoCierre,
  revisar: r.revisar ?? undefined,
  cantidadCuotas: r.cantidad_cuotas ?? undefined,
  montoCuotaUsd: r.monto_cuota_usd ?? undefined,
  fechaPrimeraCuota: r.fecha_primera_cuota ?? undefined,
  inactivo: r.inactivo === 1,
});

interface PagoRow {
  id_pago: string;
  id_cierre: string;
  fecha_pago: string;
  hora_pago: string | null;
  monto_usd: number;
  monto_ars: number | null;
  cotizacion: number | null;
  tipo_pago: string;
  numero_cuota: string | null;
  medio_pago: string;
  comprobante_url: string | null;
  comentarios: string | null;
  closer: string | null;
  aplica_setting: number | null;
  setter: string | null;
}
const toPago = (r: PagoRow): Pago => ({
  idPago: r.id_pago,
  idCierre: r.id_cierre,
  fechaPago: r.fecha_pago,
  horaPago: r.hora_pago ?? undefined,
  montoUsd: r.monto_usd,
  montoArs: r.monto_ars ?? undefined,
  cotizacion: r.cotizacion ?? undefined,
  tipoPago: r.tipo_pago as TipoPago,
  numeroCuota: r.numero_cuota ?? undefined,
  medioPago: r.medio_pago as MedioPago,
  comprobanteUrl: r.comprobante_url ?? undefined,
  comentarios: r.comentarios ?? undefined,
  closer: r.closer ?? undefined,
  aplicaSetting: r.aplica_setting === 1,
  setter: r.setter ?? undefined,
});

export function crearReposCierresPg(pool: Pool): ReposCierres {
  const cierres: CierresRepo = {
    async obtener(id) {
      const r = await pool.query('SELECT * FROM cierres WHERE id_cierre = $1', [id]);
      const row = r.rows[0] as CierreRow | undefined;
      return row ? toCierre(row) : null;
    },
    async listar(filtros: FiltrosCierres = {}) {
      const where: string[] = ['1=1'];
      const params: unknown[] = [];
      const n = () => `$${params.length}`;
      if (filtros.mes) {
        params.push(filtros.mes);
        where.push(`substr(fecha_cierre,1,7) = ${n()}`);
      }
      if (filtros.programa) {
        params.push(filtros.programa);
        where.push(`programa = ${n()}`);
      }
      if (filtros.closer) {
        // "Cierres donde ese closer cobró ≥1 pago" (closer efectivo del pago =
        // pago.closer, o el del cierre si el pago no tiene closer propio).
        params.push(filtros.closer);
        where.push(
          `EXISTS (SELECT 1 FROM pagos p WHERE p.id_cierre = cierres.id_cierre AND COALESCE(p.closer, cierres.closer) = ${n()})`,
        );
      }
      if (filtros.estado) {
        params.push(filtros.estado);
        where.push(`estado = ${n()}`);
      }
      if (filtros.unidadNegocio && filtros.unidadNegocio !== 'CONSOLIDADO') {
        params.push(filtros.unidadNegocio);
        where.push(`unidad_negocio = ${n()}`);
      }
      if (filtros.q) {
        const like = `%${filtros.q.toLowerCase()}%`;
        params.push(like);
        const p1 = n();
        params.push(like);
        where.push(`(lower(cliente_nombre) LIKE ${p1} OR lower(cliente_mail) LIKE ${n()})`);
      }
      const r = await pool.query(
        `SELECT * FROM cierres WHERE ${where.join(' AND ')} ORDER BY fecha_cierre DESC`,
        params,
      );
      return (r.rows as CierreRow[]).map(toCierre);
    },
    async guardar(c) {
      await pool.query(
        `INSERT INTO cierres
         (id_cierre, fecha_cierre, cliente_nombre, cliente_mail, cliente_telefono, programa,
          ticket_total_usd, closer, setter, funnel, referido, comentarios, unidad_negocio, estado, revisar,
          cantidad_cuotas, monto_cuota_usd, fecha_primera_cuota, inactivo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (id_cierre) DO UPDATE SET
          fecha_cierre=EXCLUDED.fecha_cierre, cliente_nombre=EXCLUDED.cliente_nombre,
          cliente_mail=EXCLUDED.cliente_mail, cliente_telefono=EXCLUDED.cliente_telefono,
          programa=EXCLUDED.programa, ticket_total_usd=EXCLUDED.ticket_total_usd,
          closer=EXCLUDED.closer, setter=EXCLUDED.setter, funnel=EXCLUDED.funnel,
          referido=EXCLUDED.referido, comentarios=EXCLUDED.comentarios,
          unidad_negocio=EXCLUDED.unidad_negocio, estado=EXCLUDED.estado, revisar=EXCLUDED.revisar,
          cantidad_cuotas=EXCLUDED.cantidad_cuotas, monto_cuota_usd=EXCLUDED.monto_cuota_usd,
          fecha_primera_cuota=EXCLUDED.fecha_primera_cuota, inactivo=EXCLUDED.inactivo`,
        [c.idCierre, c.fechaCierre, c.clienteNombre, c.clienteMail ?? null, c.clienteTelefono ?? null,
         c.programa, c.ticketTotalUsd, c.closer ?? null, c.setter ?? null, c.funnel ?? null,
         c.referido ?? null, c.comentarios ?? null, c.unidadNegocio, c.estado, c.revisar ?? null,
         c.cantidadCuotas ?? null, c.montoCuotaUsd ?? null, c.fechaPrimeraCuota ?? null, c.inactivo ? 1 : 0],
      );
    },
    async eliminar(id) {
      await pool.query('DELETE FROM cierres WHERE id_cierre = $1', [id]);
    },
    async borrarDemo() {
      const r = await pool.query(`DELETE FROM cierres WHERE id_cierre LIKE '${DEMO_PREFIX}%'`);
      return r.rowCount ?? 0;
    },
    async vaciar() {
      const r = await pool.query('DELETE FROM cierres');
      return r.rowCount ?? 0;
    },
  };

  const pagos: PagosRepo = {
    async listarPorCierre(idCierre) {
      const r = await pool.query('SELECT * FROM pagos WHERE id_cierre = $1 ORDER BY fecha_pago', [idCierre]);
      return (r.rows as PagoRow[]).map(toPago);
    },
    async listarTodos() {
      const r = await pool.query('SELECT * FROM pagos ORDER BY fecha_pago');
      return (r.rows as PagoRow[]).map(toPago);
    },
    async guardar(p) {
      await pool.query(
        `INSERT INTO pagos
         (id_pago, id_cierre, fecha_pago, hora_pago, monto_usd, monto_ars, cotizacion,
          tipo_pago, numero_cuota, medio_pago, comprobante_url, comentarios, closer, aplica_setting, setter)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (id_pago) DO UPDATE SET
          id_cierre=EXCLUDED.id_cierre, fecha_pago=EXCLUDED.fecha_pago, hora_pago=EXCLUDED.hora_pago,
          monto_usd=EXCLUDED.monto_usd, monto_ars=EXCLUDED.monto_ars, cotizacion=EXCLUDED.cotizacion,
          tipo_pago=EXCLUDED.tipo_pago, numero_cuota=EXCLUDED.numero_cuota, medio_pago=EXCLUDED.medio_pago,
          comprobante_url=EXCLUDED.comprobante_url, comentarios=EXCLUDED.comentarios, closer=EXCLUDED.closer,
          aplica_setting=EXCLUDED.aplica_setting, setter=EXCLUDED.setter`,
        [p.idPago, p.idCierre, p.fechaPago, p.horaPago ?? null, p.montoUsd, p.montoArs ?? null,
         p.cotizacion ?? null, p.tipoPago, p.numeroCuota ?? null, p.medioPago, p.comprobanteUrl ?? null,
         p.comentarios ?? null, p.closer ?? null, p.aplicaSetting ? 1 : 0, p.setter ?? null],
      );
    },
    async eliminar(id) {
      await pool.query('DELETE FROM pagos WHERE id_pago = $1', [id]);
    },
    async borrarDemo() {
      const r = await pool.query(
        `DELETE FROM pagos WHERE id_pago LIKE '${DEMO_PREFIX}%' OR id_cierre LIKE '${DEMO_PREFIX}%'`,
      );
      return r.rowCount ?? 0;
    },
    async vaciar() {
      const r = await pool.query('DELETE FROM pagos');
      return r.rowCount ?? 0;
    },
  };

  return { cierres, pagos };
}
