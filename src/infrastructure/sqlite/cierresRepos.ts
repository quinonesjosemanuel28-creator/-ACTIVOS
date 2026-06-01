/**
 * CAPA 4 — INFRAESTRUCTURA · Repositorios SQLite del módulo Cierres y Clientes.
 * Implementan los puertos de la aplicación. Mapean filas snake_case ↔ dominio.
 */
import type Database from 'better-sqlite3';
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

/** Prefijo de IDs sembrados; "Borrar datos de demostración" filtra por él. */
export const DEMO_PREFIX = 'DEMO-';

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

export function crearReposCierres(db: Database.Database): ReposCierres {
  const cierres: CierresRepo = {
    obtener(id) {
      const row = db.prepare('SELECT * FROM cierres WHERE id_cierre = ?').get(id) as CierreRow | undefined;
      return row ? toCierre(row) : null;
    },
    listar(filtros: FiltrosCierres = {}) {
      const where: string[] = ['1=1'];
      const params: unknown[] = [];
      if (filtros.mes) {
        where.push("substr(fecha_cierre,1,7) = ?");
        params.push(filtros.mes);
      }
      if (filtros.programa) {
        where.push('programa = ?');
        params.push(filtros.programa);
      }
      if (filtros.closer) {
        // "Cierres donde ese closer cobró ≥1 pago" (closer efectivo del pago =
        // pago.closer, o el del cierre si el pago no tiene closer propio).
        where.push(
          'EXISTS (SELECT 1 FROM pagos p WHERE p.id_cierre = cierres.id_cierre AND COALESCE(p.closer, cierres.closer) = ?)',
        );
        params.push(filtros.closer);
      }
      if (filtros.estado) {
        where.push('estado = ?');
        params.push(filtros.estado);
      }
      if (filtros.unidadNegocio && filtros.unidadNegocio !== 'CONSOLIDADO') {
        where.push('unidad_negocio = ?');
        params.push(filtros.unidadNegocio);
      }
      if (filtros.q) {
        where.push('(lower(cliente_nombre) LIKE ? OR lower(cliente_mail) LIKE ?)');
        const like = `%${filtros.q.toLowerCase()}%`;
        params.push(like, like);
      }
      const rows = db
        .prepare(`SELECT * FROM cierres WHERE ${where.join(' AND ')} ORDER BY fecha_cierre DESC`)
        .all(...params) as CierreRow[];
      return rows.map(toCierre);
    },
    guardar(c) {
      // UPSERT con ON CONFLICT DO UPDATE (no INSERT OR REPLACE): editar un
      // cierre actualiza la fila EN SU LUGAR. REPLACE borraría la fila y, por
      // el FK ON DELETE CASCADE de `pagos`, eliminaría sus pagos.
      db.prepare(
        `INSERT INTO cierres
         (id_cierre, fecha_cierre, cliente_nombre, cliente_mail, cliente_telefono, programa,
          ticket_total_usd, closer, setter, funnel, referido, comentarios, unidad_negocio, estado, revisar,
          cantidad_cuotas, monto_cuota_usd, fecha_primera_cuota, inactivo)
         VALUES (@idCierre,@fechaCierre,@clienteNombre,@clienteMail,@clienteTelefono,@programa,
          @ticketTotalUsd,@closer,@setter,@funnel,@referido,@comentarios,@unidadNegocio,@estado,@revisar,
          @cantidadCuotas,@montoCuotaUsd,@fechaPrimeraCuota,@inactivo)
         ON CONFLICT(id_cierre) DO UPDATE SET
          fecha_cierre=excluded.fecha_cierre, cliente_nombre=excluded.cliente_nombre,
          cliente_mail=excluded.cliente_mail, cliente_telefono=excluded.cliente_telefono,
          programa=excluded.programa, ticket_total_usd=excluded.ticket_total_usd,
          closer=excluded.closer, setter=excluded.setter, funnel=excluded.funnel,
          referido=excluded.referido, comentarios=excluded.comentarios,
          unidad_negocio=excluded.unidad_negocio, estado=excluded.estado, revisar=excluded.revisar,
          cantidad_cuotas=excluded.cantidad_cuotas, monto_cuota_usd=excluded.monto_cuota_usd,
          fecha_primera_cuota=excluded.fecha_primera_cuota, inactivo=excluded.inactivo`,
      ).run({
        ...c,
        clienteMail: c.clienteMail ?? null,
        clienteTelefono: c.clienteTelefono ?? null,
        cantidadCuotas: c.cantidadCuotas ?? null,
        montoCuotaUsd: c.montoCuotaUsd ?? null,
        fechaPrimeraCuota: c.fechaPrimeraCuota ?? null,
        inactivo: c.inactivo ? 1 : 0,
        closer: c.closer ?? null,
        setter: c.setter ?? null,
        funnel: c.funnel ?? null,
        referido: c.referido ?? null,
        comentarios: c.comentarios ?? null,
        revisar: c.revisar ?? null,
      });
    },
    eliminar(id) {
      db.prepare('DELETE FROM cierres WHERE id_cierre = ?').run(id);
    },
    borrarDemo() {
      return db.prepare(`DELETE FROM cierres WHERE id_cierre LIKE '${DEMO_PREFIX}%'`).run().changes;
    },
    vaciar() {
      return db.prepare('DELETE FROM cierres').run().changes;
    },
  };

  const pagos: PagosRepo = {
    listarPorCierre(idCierre) {
      return (
        db.prepare('SELECT * FROM pagos WHERE id_cierre = ? ORDER BY fecha_pago').all(idCierre) as PagoRow[]
      ).map(toPago);
    },
    listarTodos() {
      return (db.prepare('SELECT * FROM pagos ORDER BY fecha_pago').all() as PagoRow[]).map(toPago);
    },
    guardar(p) {
      db.prepare(
        `INSERT OR REPLACE INTO pagos
         (id_pago, id_cierre, fecha_pago, hora_pago, monto_usd, monto_ars, cotizacion,
          tipo_pago, numero_cuota, medio_pago, comprobante_url, comentarios, closer, aplica_setting, setter)
         VALUES (@idPago,@idCierre,@fechaPago,@horaPago,@montoUsd,@montoArs,@cotizacion,
          @tipoPago,@numeroCuota,@medioPago,@comprobanteUrl,@comentarios,@closer,@aplicaSetting,@setter)`,
      ).run({
        ...p,
        horaPago: p.horaPago ?? null,
        montoArs: p.montoArs ?? null,
        cotizacion: p.cotizacion ?? null,
        numeroCuota: p.numeroCuota ?? null,
        comprobanteUrl: p.comprobanteUrl ?? null,
        comentarios: p.comentarios ?? null,
        closer: p.closer ?? null,
        aplicaSetting: p.aplicaSetting ? 1 : 0,
        setter: p.setter ?? null,
      });
    },
    eliminar(id) {
      db.prepare('DELETE FROM pagos WHERE id_pago = ?').run(id);
    },
    borrarDemo() {
      return db
        .prepare(`DELETE FROM pagos WHERE id_pago LIKE '${DEMO_PREFIX}%' OR id_cierre LIKE '${DEMO_PREFIX}%'`)
        .run().changes;
    },
    vaciar() {
      return db.prepare('DELETE FROM pagos').run().changes;
    },
  };

  return { cierres, pagos };
}
