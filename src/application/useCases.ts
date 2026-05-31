/**
 * CAPA 2 — APLICACIÓN · Casos de uso.
 *
 * Orquestan dominio + datos. No contienen reglas de negocio propias: toda
 * fórmula vive en el dominio (CAPA 3). Reciben los repositorios por
 * inyección (puertos), nunca conocen SQLite directamente.
 */
import { construirSnapshot, type DashboardSnapshot } from '../domain/dashboard';
import { evaluarAlertas, type Alerta } from '../domain/alerts';
import { filtrarPorPrograma } from '../domain/metrics';
import type { DatosMes, EstadoMes, Mes, Programa } from '../domain/types';
import type { Filtro, Repositorios } from './ports';
import {
  cobroInputSchema,
  egresoInputSchema,
  funnelInputSchema,
  parametrosInputSchema,
  ventaInputSchema,
  type CobroInput,
  type EgresoInput,
  type ParametrosInput,
} from './schemas';
import { parsearTablero } from '../infrastructure/excel/parser';

/** Mes anterior en formato YYYY-MM. */
function mesAnterior(mes: Mes): Mes {
  const [y, m] = mes.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function datosDeMes(repos: Repositorios, mes: Mes, filtro?: Filtro): DatosMes {
  return {
    mes,
    ventas: repos.ventas.listarPorMes(mes, filtro),
    cobros: repos.cobros.listarPorMes(mes, filtro),
    egresos: repos.egresos.listarPorMes(mes, filtro),
  };
}

export interface DashboardResult {
  snapshot: DashboardSnapshot;
  alertas: Alerta[];
  estadoMes: EstadoMes;
  programa: 'TODOS' | Programa;
}

/** Caso de uso central: arma el dashboard del mes (recalcula todo). */
export function obtenerDashboardDelMes(
  repos: Repositorios,
  mes: Mes,
  opciones: { filtro?: Filtro; programa?: 'TODOS' | Programa } = {},
): DashboardResult {
  const { filtro, programa = 'TODOS' } = opciones;
  const previo = mesAnterior(mes);

  let datosMes = datosDeMes(repos, mes, filtro);
  let datosPrev: DatosMes | null = datosDeMes(repos, previo, filtro);
  if (datosPrev.ventas.length === 0 && datosPrev.cobros.length === 0 && datosPrev.egresos.length === 0) {
    datosPrev = null;
  }

  if (programa !== 'TODOS') {
    datosMes = filtrarPorPrograma(datosMes, programa);
    if (datosPrev) datosPrev = filtrarPorPrograma(datosPrev, programa);
  }

  const parametros = repos.parametros.obtener();
  const snapshot = construirSnapshot({
    mes,
    datosMes,
    datosMesAnterior: datosPrev,
    cobrosHistoricos: repos.cobros.listarTodos(filtro),
    egresosHistoricos: repos.egresos.listarTodos(filtro),
    ventasHistoricas: repos.ventas.listarTodas(filtro),
    funnel: repos.funnel.obtener(mes, filtro),
    funnelAnterior: repos.funnel.obtener(previo, filtro),
    parametros,
  });

  const alertas = evaluarAlertas({ snapshot, datosMes, parametros });
  return { snapshot, alertas, estadoMes: repos.cierre.estado(mes), programa };
}

/** Serie histórica para la pantalla de evolución (6+ meses). */
export interface PuntoHistorico {
  mes: Mes;
  cashCollected: number;
  cashNuevo: number;
  cohortes: number;
  utilidad: number;
  cajaFinal: number;
  cierres: number;
}

export function obtenerHistorico(repos: Repositorios, filtro?: Filtro): PuntoHistorico[] {
  const meses = repos.cierre.mesesConDatos();
  return meses.map((mes) => {
    const { snapshot } = obtenerDashboardDelMes(repos, mes, { filtro });
    return {
      mes,
      cashCollected: snapshot.cashCollected.valor ?? 0,
      cashNuevo: snapshot.cashNuevo,
      cohortes: snapshot.cohortes,
      utilidad: snapshot.utilidadOperativa.valor ?? 0,
      cajaFinal: snapshot.cajaFinal.valor ?? 0,
      cierres: snapshot.cierres.valor ?? 0,
    };
  });
}

/** Comparativa Empresario vs Gestor (R8). */
export function compararProgramas(repos: Repositorios, mes: Mes, filtro?: Filtro) {
  return {
    empresario: obtenerDashboardDelMes(repos, mes, { filtro, programa: 'Empresario' }).snapshot,
    gestor: obtenerDashboardDelMes(repos, mes, { filtro, programa: 'Gestor' }).snapshot,
  };
}

// ───────────────────────── Carga de datos (R6: respeta cierre) ─────────────

function assertAbierto(repos: Repositorios, mes: Mes): void {
  if (repos.cierre.estado(mes) === 'Cerrado') {
    throw new Error(`El mes ${mes} está cerrado y no admite ediciones (R6).`);
  }
}

export function agregarVenta(repos: Repositorios, input: unknown): void {
  const v = ventaInputSchema.parse(input);
  const mes = v.fechaVenta.slice(0, 7);
  assertAbierto(repos, mes);
  repos.ventas.insertar({
    idVenta: v.idVenta ?? `V-${mes}-${Date.now()}`,
    fechaVenta: v.fechaVenta,
    mesVenta: mes,
    cliente: v.cliente,
    programa: v.programa,
    closer: v.closer,
    setter: v.setter,
    funnel: v.funnel,
    ticketTotalUsd: v.ticketTotalUsd,
    unidadNegocio: v.unidadNegocio,
    estado: 'Activo',
  });
}

export function agregarCobro(repos: Repositorios, input: unknown): void {
  const c: CobroInput = cobroInputSchema.parse(input);
  const mesCobro = c.fechaCobro.slice(0, 7);
  assertAbierto(repos, mesCobro);
  repos.cobros.insertar({
    idCobro: c.idCobro ?? `C-${mesCobro}-${Date.now()}`,
    idVentaOrigen: c.idVentaOrigen,
    fechaCobro: c.fechaCobro,
    mesCobro,
    mesOriginalVenta: c.mesOriginalVenta,
    montoUsd: c.montoUsd,
    programa: c.programa,
    unidadNegocio: c.unidadNegocio,
  });
}

export function agregarEgreso(repos: Repositorios, input: unknown): void {
  const e: EgresoInput = egresoInputSchema.parse(input);
  const mes = e.fecha.slice(0, 7);
  assertAbierto(repos, mes);
  repos.egresos.insertar({
    idEgreso: e.idEgreso ?? `E-${mes}-${Date.now()}`,
    fecha: e.fecha,
    mes,
    tipo: e.tipo,
    categoria: e.categoria,
    concepto: e.concepto,
    montoUsd: e.montoUsd,
    programa: e.programa,
    unidadNegocio: e.unidadNegocio,
  });
}

export function guardarParametros(repos: Repositorios, input: unknown): void {
  const p: ParametrosInput = parametrosInputSchema.parse(input);
  repos.parametros.guardar(p);
}

export function guardarFunnel(repos: Repositorios, mes: Mes, input: unknown, filtro?: Filtro): void {
  assertAbierto(repos, mes);
  const f = funnelInputSchema.parse(input);
  // cerrados se deriva (no se guarda); se persiste 0 y se ignora en lectura.
  repos.funnel.guardar(mes, { agendas: f.agendas, asistieron: f.asistieron, cerrados: 0 }, filtro);
}

// ───────────────────────── Cierre de mes (R6) ─────────────────────────

export function cerrarMes(repos: Repositorios, mes: Mes): void {
  repos.cierre.cerrar(mes);
}
export function reabrirMes(repos: Repositorios, mes: Mes): void {
  repos.cierre.reabrir(mes);
}

// ───────────────────────── Importación de Excel (idempotente) ─────────────

export interface ImportResult {
  ventas: number;
  cobros: number;
  egresos: number;
  advertencias: string[];
}

export function importarExcel(repos: Repositorios, buffer: Buffer): ImportResult {
  const r = parsearTablero(buffer);
  r.ventas.forEach((v) => repos.ventas.insertar(v));
  r.cobros.forEach((c) => repos.cobros.insertar(c));
  r.egresos.forEach((e) => repos.egresos.insertar(e));

  // Parámetros: mapear claves conocidas del Excel.
  const p = r.parametros;
  const mapped: ParametrosInput = {};
  if (p.caja_inicial !== undefined || p.caja_inicial_usd !== undefined)
    mapped.cajaInicialUsd = p.caja_inicial ?? p.caja_inicial_usd;
  if (p.costos_fijos !== undefined || p.costos_fijos_mensuales !== undefined)
    mapped.costosFijosMensualesUsd = p.costos_fijos ?? p.costos_fijos_mensuales;
  if (p.meta_cash !== undefined || p.meta_cash_collected !== undefined)
    mapped.metaCashCollectedUsd = p.meta_cash ?? p.meta_cash_collected;
  if (Object.keys(mapped).length) repos.parametros.guardar(mapped);

  return { ventas: r.ventas.length, cobros: r.cobros.length, egresos: r.egresos.length, advertencias: r.advertencias };
}

/** Lista de meses disponibles + el más reciente (driver maestro por defecto). */
export function obtenerMeses(repos: Repositorios): { meses: Mes[]; actual: Mes | null } {
  const meses = repos.cierre.mesesConDatos();
  return { meses, actual: meses.length ? meses[meses.length - 1]! : null };
}
