/**
 * CAPA 4 — INFRAESTRUCTURA · Repositorios SQLite.
 *
 * Implementan los puertos de la capa de aplicación (inversión de
 * dependencias). Traducen filas snake_case ↔ entidades de dominio camelCase.
 */
import type Database from 'better-sqlite3';
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

/** Cláusula WHERE de unidad (CONSOLIDADO = todas). */
function whereUnidad(filtro?: Filtro): { sql: string; params: string[] } {
  const u = filtro?.unidadNegocio;
  if (!u || u === 'CONSOLIDADO') return { sql: '', params: [] };
  return { sql: ' AND unidad_negocio = ?', params: [u] };
}

// ───────────────────────── Repos ─────────────────────────

export function crearRepositorios(db: Database.Database): Repositorios {
  const ventas: VentasRepo = {
    listarPorMes(mes, filtro) {
      const u = whereUnidad(filtro);
      return (
        db.prepare(`SELECT * FROM ventas WHERE mes_venta = ?${u.sql}`).all(mes, ...u.params) as VentaRow[]
      ).map(toVenta);
    },
    listarTodas(filtro) {
      const u = whereUnidad(filtro);
      return (
        db.prepare(`SELECT * FROM ventas WHERE 1=1${u.sql}`).all(...u.params) as VentaRow[]
      ).map(toVenta);
    },
    insertar(v) {
      db.prepare(
        `INSERT OR REPLACE INTO ventas
         (id_venta, fecha_venta, mes_venta, cliente, programa, closer, setter, funnel, ticket_total_usd, unidad_negocio, estado)
         VALUES (@idVenta,@fechaVenta,@mesVenta,@cliente,@programa,@closer,@setter,@funnel,@ticketTotalUsd,@unidadNegocio,@estado)`,
      ).run({
        ...v,
        cliente: v.cliente ?? null,
        closer: v.closer ?? null,
        setter: v.setter ?? null,
        funnel: v.funnel ?? null,
      });
    },
  };

  const cobros: CobrosRepo = {
    listarPorMes(mes, filtro) {
      const u = whereUnidad(filtro);
      return (
        db.prepare(`SELECT * FROM cobros WHERE mes_cobro = ?${u.sql}`).all(mes, ...u.params) as CobroRow[]
      ).map(toCobro);
    },
    listarTodos(filtro) {
      const u = whereUnidad(filtro);
      return (
        db.prepare(`SELECT * FROM cobros WHERE 1=1${u.sql}`).all(...u.params) as CobroRow[]
      ).map(toCobro);
    },
    insertar(c) {
      db.prepare(
        `INSERT OR REPLACE INTO cobros
         (id_cobro, id_venta_origen, fecha_cobro, mes_cobro, mes_original_venta, monto_usd, programa, unidad_negocio)
         VALUES (@idCobro,@idVentaOrigen,@fechaCobro,@mesCobro,@mesOriginalVenta,@montoUsd,@programa,@unidadNegocio)`,
      ).run({ ...c, idVentaOrigen: c.idVentaOrigen ?? null });
    },
  };

  const egresos: EgresosRepo = {
    listarPorMes(mes, filtro) {
      const u = whereUnidad(filtro);
      return (
        db.prepare(`SELECT * FROM egresos WHERE mes = ?${u.sql}`).all(mes, ...u.params) as EgresoRow[]
      ).map(toEgreso);
    },
    listarTodos(filtro) {
      const u = whereUnidad(filtro);
      return (
        db.prepare(`SELECT * FROM egresos WHERE 1=1${u.sql}`).all(...u.params) as EgresoRow[]
      ).map(toEgreso);
    },
    insertar(e) {
      db.prepare(
        `INSERT OR REPLACE INTO egresos
         (id_egreso, fecha, mes, tipo, categoria, concepto, monto_usd, programa, unidad_negocio,
          monto_ars, cotizacion, recurrente, medio_pago, comentarios)
         VALUES (@idEgreso,@fecha,@mes,@tipo,@categoria,@concepto,@montoUsd,@programa,@unidadNegocio,
          @montoArs,@cotizacion,@recurrente,@medioPago,@comentarios)`,
      ).run({
        ...e,
        concepto: e.concepto ?? null,
        programa: e.programa ?? null,
        montoArs: e.montoArs ?? null,
        cotizacion: e.cotizacion ?? null,
        recurrente: e.recurrente ? 1 : 0,
        medioPago: e.medioPago ?? null,
        comentarios: e.comentarios ?? null,
      });
    },
  };

  const funnel: FunnelRepo = {
    obtener(mes, filtro): FunnelMes {
      const u = filtro?.unidadNegocio && filtro.unidadNegocio !== 'CONSOLIDADO' ? filtro.unidadNegocio : 'ACADEMY';
      const row = db
        .prepare('SELECT agendas, asistieron, cerrados FROM funnel WHERE mes = ? AND unidad_negocio = ?')
        .get(mes, u) as { agendas: number; asistieron: number; cerrados: number } | undefined;
      return row ?? { agendas: 0, asistieron: 0, cerrados: 0 };
    },
    guardar(mes, f, filtro) {
      const u = filtro?.unidadNegocio && filtro.unidadNegocio !== 'CONSOLIDADO' ? filtro.unidadNegocio : 'ACADEMY';
      db.prepare(
        `INSERT OR REPLACE INTO funnel (mes, unidad_negocio, agendas, asistieron, cerrados)
         VALUES (?,?,?,?,?)`,
      ).run(mes, u, f.agendas, f.asistieron, f.cerrados);
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
    obtener(): Parametros {
      const filas = db.prepare('SELECT clave, valor FROM parametros').all() as {
        clave: string;
        valor: string;
      }[];
      const mapa = new Map(filas.map((f) => [f.clave, f.valor]));
      const out = { ...DEFAULTS };
      (Object.keys(CLAVES_PARAM) as (keyof Parametros)[]).forEach((k) => {
        const raw = mapa.get(CLAVES_PARAM[k]);
        if (raw !== undefined) out[k] = Number(raw);
      });
      return out;
    },
    guardar(p) {
      const stmt = db.prepare(
        'INSERT OR REPLACE INTO parametros (clave, valor) VALUES (?, ?)',
      );
      const tx = db.transaction((entries: [string, number][]) => {
        for (const [clave, valor] of entries) stmt.run(clave, String(valor));
      });
      const entries = (Object.keys(p) as (keyof Parametros)[])
        .filter((k) => p[k] !== undefined)
        .map((k) => [CLAVES_PARAM[k], p[k] as number] as [string, number]);
      tx(entries);
    },
  };

  const cierre: CierreMesRepo = {
    estado(mes): EstadoMes {
      const row = db.prepare('SELECT estado FROM cierre_mes WHERE mes = ?').get(mes) as
        | { estado: EstadoMes }
        | undefined;
      return row?.estado ?? 'Abierto';
    },
    cerrar(mes) {
      db.prepare("INSERT OR REPLACE INTO cierre_mes (mes, estado) VALUES (?, 'Cerrado')").run(mes);
    },
    reabrir(mes) {
      db.prepare("INSERT OR REPLACE INTO cierre_mes (mes, estado) VALUES (?, 'Abierto')").run(mes);
    },
    mesesConDatos(): Mes[] {
      const filas = db
        .prepare(
          `SELECT mes FROM (
             SELECT mes_venta AS mes FROM ventas
             UNION SELECT mes_cobro FROM cobros
             UNION SELECT mes FROM egresos
           ) WHERE mes IS NOT NULL ORDER BY mes`,
        )
        .all() as { mes: string }[];
      return filas.map((f) => f.mes);
    },
  };

  return { ventas, cobros, egresos, funnel, parametros, cierre };
}
