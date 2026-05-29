/**
 * CAPA 3 — DOMINIO · Ensamblado del snapshot del dashboard.
 *
 * Combina los datos del mes + historia + parámetros en un único objeto
 * `DashboardSnapshot` que la UI consume tal cual. Toda la matemática vive
 * en metrics.ts; acá solo se orquesta el armado (sin reglas nuevas).
 */
import type { Cobro, DatosMes, Egreso, FunnelMes, Mes, Parametros, Venta } from './types';
import { variacionMM } from './money';
import * as m from './metrics';

/** Una métrica con su valor actual y variación M/M (para flechas verde/roja). */
export interface MetricaMM {
  valor: number | null;
  variacion: number | null; // fracción M/M, null si no hay base previa
}

export interface DashboardSnapshot {
  mes: Mes;
  // KPIs ejecutivos (los 6 grandes de la home)
  ventasNuevas: MetricaMM;
  cashCollected: MetricaMM;
  cajaFinal: MetricaMM;
  utilidadOperativa: MetricaMM;
  cierres: MetricaMM;
  aovReal: MetricaMM;
  // Composición de cash
  cashNuevo: number;
  cohortes: number;
  concentracionCohortes: number | null;
  // Rentabilidad
  margenOperativo: number | null;
  margenContribucion: number | null;
  egresosTotales: number;
  egresosDirectos: number;
  // Marketing
  inversionMarketing: number;
  cac: number | null;
  roas: number | null;
  mer: number | null;
  // Caja
  runway: number | null;
  // Cohortes
  morosidadCohorte: number;
  // Funnel
  funnel: FunnelMes;
  tasaShow: number | null;
  tasaCierre: number | null;
}

export interface ConstruirSnapshotInput {
  mes: Mes;
  datosMes: DatosMes;
  /** Mismos datos del mes anterior (para M/M). null si no existe. */
  datosMesAnterior: DatosMes | null;
  cobrosHistoricos: readonly Cobro[];
  egresosHistoricos: readonly Egreso[];
  ventasHistoricas: readonly Venta[];
  funnel: FunnelMes;
  funnelAnterior: FunnelMes | null;
  parametros: Parametros;
}

function mm(actual: number | null, previo: number | null): MetricaMM {
  if (actual === null) return { valor: null, variacion: null };
  if (previo === null) return { valor: actual, variacion: null };
  return { valor: actual, variacion: variacionMM(actual, previo) };
}

export function construirSnapshot(input: ConstruirSnapshotInput): DashboardSnapshot {
  const { mes, datosMes, datosMesAnterior, parametros } = input;
  const prev = datosMesAnterior;

  const cajaActual = m.cajaFinal(
    parametros.cajaInicialUsd,
    input.cobrosHistoricos,
    input.egresosHistoricos,
    mes,
  );
  const cajaPrev = prev
    ? m.cajaFinal(parametros.cajaInicialUsd, input.cobrosHistoricos, input.egresosHistoricos, prev.mes)
    : null;

  return {
    mes,
    ventasNuevas: mm(m.ventasNuevasUsd(datosMes), prev ? m.ventasNuevasUsd(prev) : null),
    cashCollected: mm(m.cashCollected(datosMes.cobros), prev ? m.cashCollected(prev.cobros) : null),
    cajaFinal: mm(cajaActual, cajaPrev),
    utilidadOperativa: mm(m.utilidadOperativa(datosMes), prev ? m.utilidadOperativa(prev) : null),
    cierres: mm(m.cierresNuevos(datosMes), prev ? m.cierresNuevos(prev) : null),
    aovReal: mm(m.aovReal(datosMes), prev ? m.aovReal(prev) : null),

    cashNuevo: m.cashNuevo(datosMes.cobros),
    cohortes: m.cohortes(datosMes.cobros),
    concentracionCohortes: m.concentracionCohortes(datosMes.cobros),

    margenOperativo: m.margenOperativo(datosMes),
    margenContribucion: m.margenContribucion(datosMes),
    egresosTotales: m.egresosTotales(datosMes.egresos),
    egresosDirectos: m.egresosDirectos(datosMes.egresos),

    inversionMarketing: m.inversionMarketing(datosMes.egresos),
    cac: m.cac(datosMes),
    roas: m.roas(datosMes),
    mer: m.mer(datosMes),

    runway: m.runway(cajaActual, parametros.costosFijosMensualesUsd),

    morosidadCohorte: m.morosidadCohorte(input.ventasHistoricas, input.cobrosHistoricos, mes),

    funnel: input.funnel,
    tasaShow: m.tasaShow(input.funnel),
    tasaCierre: m.tasaCierre(input.funnel),
  };
}
