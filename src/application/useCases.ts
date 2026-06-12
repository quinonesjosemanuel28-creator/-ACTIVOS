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
import * as em from '../domain/egresos/metrics';
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

async function datosDeMes(repos: Repositorios, mes: Mes, filtro?: Filtro): Promise<DatosMes> {
  return {
    mes,
    ventas: await repos.ventas.listarPorMes(mes, filtro),
    cobros: await repos.cobros.listarPorMes(mes, filtro),
    egresos: await repos.egresos.listarPorMes(mes, filtro),
  };
}

export interface DashboardResult {
  snapshot: DashboardSnapshot;
  alertas: Alerta[];
  estadoMes: EstadoMes;
  programa: 'TODOS' | Programa;
}

/** Caso de uso central: arma el dashboard del mes (recalcula todo). */
export async function obtenerDashboardDelMes(
  repos: Repositorios,
  mes: Mes,
  opciones: { filtro?: Filtro; programa?: 'TODOS' | Programa } = {},
): Promise<DashboardResult> {
  const { filtro, programa = 'TODOS' } = opciones;
  const previo = mesAnterior(mes);

  let datosMes = await datosDeMes(repos, mes, filtro);
  let datosPrev: DatosMes | null = await datosDeMes(repos, previo, filtro);
  if (datosPrev.ventas.length === 0 && datosPrev.cobros.length === 0 && datosPrev.egresos.length === 0) {
    datosPrev = null;
  }

  if (programa !== 'TODOS') {
    datosMes = filtrarPorPrograma(datosMes, programa);
    if (datosPrev) datosPrev = filtrarPorPrograma(datosPrev, programa);
  }

  const parametros = await repos.parametros.obtener();
  const snapshot = construirSnapshot({
    mes,
    datosMes,
    datosMesAnterior: datosPrev,
    cobrosHistoricos: await repos.cobros.listarTodos(filtro),
    egresosHistoricos: await repos.egresos.listarTodos(filtro),
    ventasHistoricas: await repos.ventas.listarTodas(filtro),
    funnel: await repos.funnel.obtener(mes, filtro),
    funnelAnterior: await repos.funnel.obtener(previo, filtro),
    parametros,
  });

  const alertas = evaluarAlertas({ snapshot, datosMes, parametros });
  return { snapshot, alertas, estadoMes: await repos.cierre.estado(mes), programa };
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
  // Salidas y cash flow neto del mes (USD). Egresos de la fuente real, con
  // proyección de recurrentes (misma que la sección Egresos).
  egresosOperativos: number; // categorías 1–7 (excluye retiros de socios)
  egresosTotales: number; // incluye retiros de socios
  netoOperativo: number; // cashCollected − egresos operativos
  netoTotal: number; // cashCollected − egresos totales
}

export async function obtenerHistorico(repos: Repositorios, filtro?: Filtro): Promise<PuntoHistorico[]> {
  const meses = await repos.cierre.mesesConDatos();
  const todosEgresos = await repos.egresos.listarTodos(filtro);
  const puntos: PuntoHistorico[] = [];
  for (const mes of meses) {
    const { snapshot } = await obtenerDashboardDelMes(repos, mes, { filtro });
    const cashCollected = snapshot.cashCollected.valor ?? 0;
    const egresosMes = em.egresosDelMes(todosEgresos, mes); // proyecta recurrentes
    const egresosOperativos = em.costoOperativoUsd(egresosMes);
    const egresosTotales = em.totalUsd(egresosMes);
    puntos.push({
      mes,
      cashCollected,
      cashNuevo: snapshot.cashNuevo,
      cohortes: snapshot.cohortes,
      utilidad: snapshot.utilidadOperativa.valor ?? 0,
      cajaFinal: snapshot.cajaFinal.valor ?? 0,
      cierres: snapshot.cierres.valor ?? 0,
      egresosOperativos,
      egresosTotales,
      netoOperativo: cashCollected - egresosOperativos,
      netoTotal: cashCollected - egresosTotales,
    });
  }
  return puntos;
}

/** Comparativa Empresario vs Gestor (R8). */
export async function compararProgramas(repos: Repositorios, mes: Mes, filtro?: Filtro) {
  return {
    empresario: (await obtenerDashboardDelMes(repos, mes, { filtro, programa: 'Empresario' })).snapshot,
    gestor: (await obtenerDashboardDelMes(repos, mes, { filtro, programa: 'Gestor' })).snapshot,
  };
}

// ───────────────────────── Carga de datos (R6: respeta cierre) ─────────────

async function assertAbierto(repos: Repositorios, mes: Mes): Promise<void> {
  if ((await repos.cierre.estado(mes)) === 'Cerrado') {
    throw new Error(`El mes ${mes} está cerrado y no admite ediciones (R6).`);
  }
}

export async function agregarVenta(repos: Repositorios, input: unknown): Promise<void> {
  const v = ventaInputSchema.parse(input);
  const mes = v.fechaVenta.slice(0, 7);
  await assertAbierto(repos, mes);
  await repos.ventas.insertar({
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

export async function agregarCobro(repos: Repositorios, input: unknown): Promise<void> {
  const c: CobroInput = cobroInputSchema.parse(input);
  const mesCobro = c.fechaCobro.slice(0, 7);
  await assertAbierto(repos, mesCobro);
  await repos.cobros.insertar({
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

export async function agregarEgreso(repos: Repositorios, input: unknown): Promise<void> {
  const e: EgresoInput = egresoInputSchema.parse(input);
  const mes = e.fecha.slice(0, 7);
  await assertAbierto(repos, mes);
  await repos.egresos.insertar({
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

export async function guardarParametros(repos: Repositorios, input: unknown): Promise<void> {
  const p: ParametrosInput = parametrosInputSchema.parse(input);
  await repos.parametros.guardar(p);
}

export async function guardarFunnel(repos: Repositorios, mes: Mes, input: unknown, filtro?: Filtro): Promise<void> {
  await assertAbierto(repos, mes);
  const f = funnelInputSchema.parse(input);
  // cerrados se deriva (no se guarda); se persiste 0 y se ignora en lectura.
  await repos.funnel.guardar(mes, { agendas: f.agendas, asistieron: f.asistieron, cerrados: 0 }, filtro);
}

// ───────────────────────── Cierre de mes (R6) ─────────────────────────

export async function cerrarMes(repos: Repositorios, mes: Mes): Promise<void> {
  await repos.cierre.cerrar(mes);
}
export async function reabrirMes(repos: Repositorios, mes: Mes): Promise<void> {
  await repos.cierre.reabrir(mes);
}

// ───────────────────────── Importación de Excel (idempotente) ─────────────

export interface ImportResult {
  ventas: number;
  cobros: number;
  egresos: number;
  advertencias: string[];
}

export async function importarExcel(repos: Repositorios, buffer: Buffer): Promise<ImportResult> {
  const r = parsearTablero(buffer);
  for (const v of r.ventas) await repos.ventas.insertar(v);
  for (const c of r.cobros) await repos.cobros.insertar(c);
  for (const e of r.egresos) await repos.egresos.insertar(e);

  // Parámetros: mapear claves conocidas del Excel.
  const p = r.parametros;
  const mapped: ParametrosInput = {};
  if (p.caja_inicial !== undefined || p.caja_inicial_usd !== undefined)
    mapped.cajaInicialUsd = p.caja_inicial ?? p.caja_inicial_usd;
  if (p.costos_fijos !== undefined || p.costos_fijos_mensuales !== undefined)
    mapped.costosFijosMensualesUsd = p.costos_fijos ?? p.costos_fijos_mensuales;
  if (p.meta_cash !== undefined || p.meta_cash_collected !== undefined)
    mapped.metaCashCollectedUsd = p.meta_cash ?? p.meta_cash_collected;
  if (Object.keys(mapped).length) await repos.parametros.guardar(mapped);

  return { ventas: r.ventas.length, cobros: r.cobros.length, egresos: r.egresos.length, advertencias: r.advertencias };
}

/** Lista de meses disponibles + el más reciente (driver maestro por defecto). */
export async function obtenerMeses(repos: Repositorios): Promise<{ meses: Mes[]; actual: Mes | null }> {
  const meses = await repos.cierre.mesesConDatos();
  return { meses, actual: meses.length ? meses[meses.length - 1]! : null };
}
