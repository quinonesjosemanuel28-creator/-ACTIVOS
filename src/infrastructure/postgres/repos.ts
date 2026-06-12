/**
 * CAPA 4 — INFRAESTRUCTURA · Repositorios PostgreSQL (legacy).
 *
 * Implementan los MISMOS puertos que src/infrastructure/sqlite/repos.ts,
 * traducidos a pg: placeholders $1..$n, ON CONFLICT DO UPDATE en lugar de
 * INSERT OR REPLACE, y transacciones BEGIN/COMMIT. El mapeo de filas
 * snake_case ↔ dominio es idéntico al de SQLite (flags como INTEGER 0/1).
 */
import type { Pool } from 'pg';
import type {
  Cobro,
  Egreso,
  EstadoMes,
  FunnelMes,
  Mes,
  Parametros,
  Programa,
  TipoEgreso,
  UnidadNegocio,
  Venta,
} from '../../domain/types';
import type {
  CierreMesRepo,
  CobrosRepo,
  EgresosRepo,
  Filtro,
  FunnelRepo,
  ParametrosRepo,
  Repositorios,
  VentasRepo,
} from '../../application/ports';

// ───────────────────────── Mapeo de filas ─────────────────────────

interface VentaRow {
  id_venta: string;
  fecha_venta: string;
  mes_venta: string;
  cliente: string | null;
  programa: string;
  closer: string | null;
  setter: string | null;
  funnel: string | null;
  ticket_total_usd: number;
  unidad_negocio: string;
  estado: string;
}
const toVenta = (r: VentaRow): Venta => ({
  idVenta: r.id_venta,
  fechaVenta: r.fecha_venta,
  mesVenta: r.mes_venta,
  cliente: r.cliente ?? undefined,
  programa: r.programa as Programa,
  closer: r.closer ?? undefined,
  setter: r.setter ?? undefined,
  funnel: r.funnel ?? undefined,
  ticketTotalUsd: r.ticket_total_usd,
  unidadNegocio: r.unidad_negocio as UnidadNegocio,
  estado: r.estado,
});

interface CobroRow {
  id_cobro: string;
  id_venta_origen: string | null;
  fecha_cobro: string;
  mes_cobro: string;
  mes_original_venta: string;
  monto_usd: number;
  programa: string;
  unidad_negocio: string;
}
const toCobro = (r: CobroRow): Cobro => ({
  idCobro: r.id_cobro,
  idVentaOrigen: r.id_venta_origen ?? undefined,
  fechaCobro: r.fecha_cobro,
  mesCobro: r.mes_cobro,
  mesOriginalVenta: r.mes_original_venta,
  montoUsd: r.monto_usd,
  programa: r.programa as Programa,
  unidadNegocio: r.unidad_negocio as UnidadNegocio,
});

interface EgresoRow {
  id_egreso: string;
  fecha: string;
  mes: string;
  tipo: string;
  categoria: string;
  concepto: string | null;
  monto_usd: number;
  programa: string | null;
  unidad_negocio: string;
  monto_ars: number | null;
  cotizacion: number | null;
  recurrente: number | null;
  medio_pago: string | null;
  comentarios: string | null;
}
const toEgreso = (r: EgresoRow): Egreso => ({
  idEgreso: r.id_egreso,
  fecha: r.fecha,
  mes: r.mes,
  tipo: r.tipo as TipoEgreso,
  categoria: r.categoria,
  concepto: r.concepto ?? undefined,
  montoUsd: r.monto_usd,
  programa: (r.programa as Programa | null) ?? undefined,
  unidadNegocio: r.unidad_negocio as UnidadNegocio,
  montoArs: r.monto_ars ?? undefined,
  cotizacion: r.cotizacion ?? undefined,
  recurrente: r.recurrente === 1,
  medioPago: r.medio_pago ?? undefined,
  comentarios: r.comentarios ?? undefined,
});

/** Cláusula AND de unidad (CONSOLIDADO = todas), con placeholder posicional. */
function andUnidad(filtro: Filtro | undefined, desde: number): { sql: string; params: string[] } {
  const u = filtro?.unidadNegocio;
  if (!u || u === 'CONSOLIDADO') return { sql: '', params: [] };
  return { sql: ` AND unidad_negocio = $${desde}`, params: [u] };
}

// ───────────────────────── Repos ─────────────────────────

export function crearRepositoriosPg(pool: Pool): Repositorios {
  const ventas: VentasRepo = {
    async listarPorMes(mes, filtro) {
      const u = andUnidad(filtro, 2);
      const r = await pool.query(`SELECT * FROM ventas WHERE mes_venta = $1${u.sql}`, [mes, ...u.params]);
      return (r.rows as VentaRow[]).map(toVenta);
    },
    async listarTodas(filtro) {
      const u = andUnidad(filtro, 1);
      const r = await pool.query(`SELECT * FROM ventas WHERE 1=1${u.sql}`, u.params);
      return (r.rows as VentaRow[]).map(toVenta);
    },
    async insertar(v) {
      await pool.query(
        `INSERT INTO ventas
         (id_venta, fecha_venta, mes_venta, cliente, programa, closer, setter, funnel, ticket_total_usd, unidad_negocio, estado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id_venta) DO UPDATE SET
          fecha_venta=EXCLUDED.fecha_venta, mes_venta=EXCLUDED.mes_venta, cliente=EXCLUDED.cliente,
          programa=EXCLUDED.programa, closer=EXCLUDED.closer, setter=EXCLUDED.setter, funnel=EXCLUDED.funnel,
          ticket_total_usd=EXCLUDED.ticket_total_usd, unidad_negocio=EXCLUDED.unidad_negocio, estado=EXCLUDED.estado`,
        [v.idVenta, v.fechaVenta, v.mesVenta, v.cliente ?? null, v.programa, v.closer ?? null,
         v.setter ?? null, v.funnel ?? null, v.ticketTotalUsd, v.unidadNegocio, v.estado],
      );
    },
  };

  const cobros: CobrosRepo = {
    async listarPorMes(mes, filtro) {
      const u = andUnidad(filtro, 2);
      const r = await pool.query(`SELECT * FROM cobros WHERE mes_cobro = $1${u.sql}`, [mes, ...u.params]);
      return (r.rows as CobroRow[]).map(toCobro);
    },
    async listarTodos(filtro) {
      const u = andUnidad(filtro, 1);
      const r = await pool.query(`SELECT * FROM cobros WHERE 1=1${u.sql}`, u.params);
      return (r.rows as CobroRow[]).map(toCobro);
    },
    async insertar(c) {
      await pool.query(
        `INSERT INTO cobros
         (id_cobro, id_venta_origen, fecha_cobro, mes_cobro, mes_original_venta, monto_usd, programa, unidad_negocio)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id_cobro) DO UPDATE SET
          id_venta_origen=EXCLUDED.id_venta_origen, fecha_cobro=EXCLUDED.fecha_cobro, mes_cobro=EXCLUDED.mes_cobro,
          mes_original_venta=EXCLUDED.mes_original_venta, monto_usd=EXCLUDED.monto_usd,
          programa=EXCLUDED.programa, unidad_negocio=EXCLUDED.unidad_negocio`,
        [c.idCobro, c.idVentaOrigen ?? null, c.fechaCobro, c.mesCobro, c.mesOriginalVenta,
         c.montoUsd, c.programa, c.unidadNegocio],
      );
    },
  };

  const egresos: EgresosRepo = {
    async listarPorMes(mes, filtro) {
      const u = andUnidad(filtro, 2);
      const r = await pool.query(`SELECT * FROM egresos WHERE mes = $1${u.sql}`, [mes, ...u.params]);
      return (r.rows as EgresoRow[]).map(toEgreso);
    },
    async listarTodos(filtro) {
      const u = andUnidad(filtro, 1);
      const r = await pool.query(`SELECT * FROM egresos WHERE 1=1${u.sql}`, u.params);
      return (r.rows as EgresoRow[]).map(toEgreso);
    },
    async insertar(e) {
      await pool.query(
        `INSERT INTO egresos
         (id_egreso, fecha, mes, tipo, categoria, concepto, monto_usd, programa, unidad_negocio,
          monto_ars, cotizacion, recurrente, medio_pago, comentarios)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id_egreso) DO UPDATE SET
          fecha=EXCLUDED.fecha, mes=EXCLUDED.mes, tipo=EXCLUDED.tipo, categoria=EXCLUDED.categoria,
          concepto=EXCLUDED.concepto, monto_usd=EXCLUDED.monto_usd, programa=EXCLUDED.programa,
          unidad_negocio=EXCLUDED.unidad_negocio, monto_ars=EXCLUDED.monto_ars, cotizacion=EXCLUDED.cotizacion,
          recurrente=EXCLUDED.recurrente, medio_pago=EXCLUDED.medio_pago, comentarios=EXCLUDED.comentarios`,
        [e.idEgreso, e.fecha, e.mes, e.tipo, e.categoria, e.concepto ?? null, e.montoUsd,
         e.programa ?? null, e.unidadNegocio, e.montoArs ?? null, e.cotizacion ?? null,
         e.recurrente ? 1 : 0, e.medioPago ?? null, e.comentarios ?? null],
      );
    },
  };

  const funnel: FunnelRepo = {
    async obtener(mes, filtro): Promise<FunnelMes> {
      const u = filtro?.unidadNegocio && filtro.unidadNegocio !== 'CONSOLIDADO' ? filtro.unidadNegocio : 'ACADEMY';
      const r = await pool.query(
        'SELECT agendas, asistieron, cerrados FROM funnel WHERE mes = $1 AND unidad_negocio = $2',
        [mes, u],
      );
      return (r.rows[0] as FunnelMes | undefined) ?? { agendas: 0, asistieron: 0, cerrados: 0 };
    },
    async guardar(mes, f, filtro) {
      const u = filtro?.unidadNegocio && filtro.unidadNegocio !== 'CONSOLIDADO' ? filtro.unidadNegocio : 'ACADEMY';
      await pool.query(
        `INSERT INTO funnel (mes, unidad_negocio, agendas, asistieron, cerrados)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (mes, unidad_negocio) DO UPDATE SET
          agendas=EXCLUDED.agendas, asistieron=EXCLUDED.asistieron, cerrados=EXCLUDED.cerrados`,
        [mes, u, f.agendas, f.asistieron, f.cerrados],
      );
    },
  };

  const CLAVES_PARAM: Record<keyof Parametros, string> = {
    cajaInicialUsd: 'caja_inicial_usd',
    costosFijosMensualesUsd: 'costos_fijos_mensuales_usd',
    metaCashCollectedUsd: 'meta_cash_collected_usd',
    metaMargenOperativo: 'meta_margen_operativo',
    topeCacUsd: 'tope_cac_usd',
    metaTasaCierre: 'meta_tasa_cierre',
    runwayMinimoMeses: 'runway_minimo_meses',
    objetivoRoas: 'objetivo_roas',
    objetivoMer: 'objetivo_mer',
  };
  const DEFAULTS: Parametros = {
    cajaInicialUsd: 0,
    costosFijosMensualesUsd: 0,
    metaCashCollectedUsd: 0,
    metaMargenOperativo: 0.25,
    topeCacUsd: 350,
    metaTasaCierre: 0.2,
    runwayMinimoMeses: 3,
    objetivoRoas: 3,
    objetivoMer: 3,
  };

  const parametros: ParametrosRepo = {
    async obtener(): Promise<Parametros> {
      const r = await pool.query('SELECT clave, valor FROM parametros');
      const mapa = new Map((r.rows as { clave: string; valor: string }[]).map((f) => [f.clave, f.valor]));
      const out = { ...DEFAULTS };
      (Object.keys(CLAVES_PARAM) as (keyof Parametros)[]).forEach((k) => {
        const raw = mapa.get(CLAVES_PARAM[k]);
        if (raw !== undefined) out[k] = Number(raw);
      });
      return out;
    },
    async guardar(p) {
      const entries = (Object.keys(p) as (keyof Parametros)[])
        .filter((k) => p[k] !== undefined)
        .map((k) => [CLAVES_PARAM[k], p[k] as number] as [string, number]);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const [clave, valor] of entries) {
          await client.query(
            'INSERT INTO parametros (clave, valor) VALUES ($1,$2) ON CONFLICT (clave) DO UPDATE SET valor=EXCLUDED.valor',
            [clave, String(valor)],
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
  };

  const cierre: CierreMesRepo = {
    async estado(mes): Promise<EstadoMes> {
      const r = await pool.query('SELECT estado FROM cierre_mes WHERE mes = $1', [mes]);
      return (r.rows[0] as { estado: EstadoMes } | undefined)?.estado ?? 'Abierto';
    },
    async cerrar(mes) {
      await pool.query(
        "INSERT INTO cierre_mes (mes, estado) VALUES ($1, 'Cerrado') ON CONFLICT (mes) DO UPDATE SET estado='Cerrado'",
        [mes],
      );
    },
    async reabrir(mes) {
      await pool.query(
        "INSERT INTO cierre_mes (mes, estado) VALUES ($1, 'Abierto') ON CONFLICT (mes) DO UPDATE SET estado='Abierto'",
        [mes],
      );
    },
    async mesesConDatos(): Promise<Mes[]> {
      const r = await pool.query(
        `SELECT mes FROM (
           SELECT mes_venta AS mes FROM ventas
           UNION SELECT mes_cobro FROM cobros
           UNION SELECT mes FROM egresos
         ) t WHERE mes IS NOT NULL ORDER BY mes`,
      );
      return (r.rows as { mes: string }[]).map((f) => f.mes);
    },
  };

  return { ventas, cobros, egresos, funnel, parametros, cierre };
}
