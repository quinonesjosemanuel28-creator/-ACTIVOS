/**
 * CAPA 3 — DOMINIO · Motor de cálculo financiero.
 *
 * TODAS las fórmulas viven acá como funciones puras. Cada una está
 * comentada con su regla de gobierno de origen (R1–R8) traducida del
 * tablero CFO-grade. No inventar ni alterar estas reglas.
 *
 * Convención de nulos: cuando una métrica depende de una división por un
 * denominador que puede ser 0 (cierres, inversión, cash), devuelve `null`.
 * La UI traduce `null` a "—". Nunca NaN, nunca crash.
 */
import type { DatosMes, Egreso, Cobro, FunnelMes, Mes, Parametros, Programa } from './types';
import { safeDiv, sumBy } from './money';

// ───────────────────────── Helpers de filtrado ─────────────────────────

/** Egresos de categoría Marketing (insumo de CAC / ROAS / MER). */
export function inversionMarketing(egresos: readonly Egreso[]): number {
  return sumBy(
    egresos.filter((e) => e.categoria.toLowerCase() === 'marketing'),
    (e) => e.montoUsd,
  );
}

/** Egresos directos: tipo 'Directo' (insumo de margen de contribución). */
export function egresosDirectos(egresos: readonly Egreso[]): number {
  return sumBy(
    egresos.filter((e) => e.tipo === 'Directo'),
    (e) => e.montoUsd,
  );
}

/** Total de egresos del mes (todos los tipos). */
export function egresosTotales(egresos: readonly Egreso[]): number {
  return sumBy(egresos, (e) => e.montoUsd);
}

// ───────────────────────── Cash (R1: lente "cobros") ─────────────────────────

/** Cash Collected = Σ cobros del mes (por mes_cobro). Dinero efectivo del mes. */
export function cashCollected(cobros: readonly Cobro[]): number {
  return sumBy(cobros, (c) => c.montoUsd);
}

/**
 * Cash Nuevo = Σ cobros donde mes_cobro = mes_original_venta.
 * Es el "motor nuevo": dinero cobrado de ventas del propio mes.
 */
export function cashNuevo(cobros: readonly Cobro[]): number {
  return sumBy(
    cobros.filter((c) => c.mesCobro === c.mesOriginalVenta),
    (c) => c.montoUsd,
  );
}

/** Cohortes = Cash Collected − Cash Nuevo. Cobros de meses anteriores. */
export function cohortes(cobros: readonly Cobro[]): number {
  return cashCollected(cobros) - cashNuevo(cobros);
}

/** Fracción del cash que proviene de cohortes. null si no hubo cash. */
export function concentracionCohortes(cobros: readonly Cobro[]): number | null {
  return safeDiv(cohortes(cobros), cashCollected(cobros));
}

// ───────────────────────── Ventas (R1: lente "comprometido") ─────────────────

/** Ventas Nuevas (USD) = Σ ticket_total_usd con mes_venta = mes. Comprometido. */
export function ventasNuevasUsd(datos: DatosMes): number {
  return sumBy(datos.ventas, (v) => v.ticketTotalUsd);
}

/** Cierres Nuevos = cantidad de filas en VENTAS del mes. */
export function cierresNuevos(datos: DatosMes): number {
  return datos.ventas.length;
}

/**
 * AOV Real = Cash Nuevo / Cierres Nuevos.
 * R2: el AOV Real se calcula SOLO con Cash Nuevo (excluye cohortes).
 * null si Cierres = 0.
 */
export function aovReal(datos: DatosMes): number | null {
  return safeDiv(cashNuevo(datos.cobros), cierresNuevos(datos));
}

// ───────────────────────── Rentabilidad ─────────────────────────

/** Utilidad Operativa = Cash Collected − Egresos Totales. */
export function utilidadOperativa(datos: DatosMes): number {
  return cashCollected(datos.cobros) - egresosTotales(datos.egresos);
}

/** Margen Operativo = Utilidad Operativa / Cash Collected. Meta ≥ 25%. */
export function margenOperativo(datos: DatosMes): number | null {
  return safeDiv(utilidadOperativa(datos), cashCollected(datos.cobros));
}

/**
 * Margen de Contribución = (Cash Collected − Egresos Directos) / Cash Collected.
 * Ignora estructura: mide la rentabilidad antes de costos fijos.
 */
export function margenContribucion(datos: DatosMes): number | null {
  const cc = cashCollected(datos.cobros);
  return safeDiv(cc - egresosDirectos(datos.egresos), cc);
}

// ───────────────────────── Marketing & adquisición ─────────────────────────

/** CAC = Inversión Marketing / Cierres Nuevos. Tope $350. null si Cierres = 0. */
export function cac(datos: DatosMes): number | null {
  return safeDiv(inversionMarketing(datos.egresos), cierresNuevos(datos));
}

/** ROAS = Cash Collected / Inversión Marketing. null si no hubo inversión. */
export function roas(datos: DatosMes): number | null {
  return safeDiv(cashCollected(datos.cobros), inversionMarketing(datos.egresos));
}

/** MER = Ventas Nuevas / Inversión Marketing. null si no hubo inversión. */
export function mer(datos: DatosMes): number | null {
  return safeDiv(ventasNuevasUsd(datos), inversionMarketing(datos.egresos));
}

// ───────────────────────── Caja & runway (R4: arrastre histórico) ─────────────

/**
 * Caja Final = Caja Inicial + Cobros acumulados − Egresos acumulados.
 * R4: arrastre histórico — se acumulan TODOS los movimientos hasta `hastaMes`
 * inclusive, no solo los del mes. `historia` debe venir ordenable por mes.
 */
export function cajaFinal(
  cajaInicial: number,
  cobrosHistoricos: readonly Cobro[],
  egresosHistoricos: readonly Egreso[],
  hastaMes: Mes,
): number {
  const cobrosAcum = sumBy(
    cobrosHistoricos.filter((c) => c.mesCobro <= hastaMes),
    (c) => c.montoUsd,
  );
  const egresosAcum = sumBy(
    egresosHistoricos.filter((e) => e.mes <= hastaMes),
    (e) => e.montoUsd,
  );
  return cajaInicial + cobrosAcum - egresosAcum;
}

/** Runway = Caja Final / Costos Fijos Mensuales. Meses de oxígeno. */
export function runway(cajaFinalUsd: number, costosFijosMensuales: number): number | null {
  return safeDiv(cajaFinalUsd, costosFijosMensuales);
}

// ───────────────────────── Cohortes / morosidad ─────────────────────────

/**
 * Morosidad de cohorte = Comprometido cohorte − Cobrado cohorte.
 * Comprometido: ticket de ventas de meses < `mes`.
 * Cobrado: cobros cuyo mes_original_venta < `mes` (cohorte) ya recibidos.
 * Pendiente de gestión de cartera.
 */
export function morosidadCohorte(
  ventasHistoricas: readonly { mesVenta: Mes; ticketTotalUsd: number }[],
  cobrosHistoricos: readonly Cobro[],
  mes: Mes,
): number {
  const comprometidoCohorte = sumBy(
    ventasHistoricas.filter((v) => v.mesVenta < mes),
    (v) => v.ticketTotalUsd,
  );
  const cobradoCohorte = sumBy(
    cobrosHistoricos.filter((c) => c.mesOriginalVenta < mes),
    (c) => c.montoUsd,
  );
  return comprometidoCohorte - cobradoCohorte;
}

// ───────────────────────── Funnel comercial ─────────────────────────

/** Tasa de show = Asistieron / Agendas. */
export function tasaShow(f: FunnelMes): number | null {
  return safeDiv(f.asistieron, f.agendas);
}

/** Tasa de cierre = Cerrados / Asistieron. */
export function tasaCierre(f: FunnelMes): number | null {
  return safeDiv(f.cerrados, f.asistieron);
}

// ───────────────────────── R8: filtrado por programa ─────────────────────────

/** Filtra los datos de un mes a un programa específico (R8). */
export function filtrarPorPrograma(datos: DatosMes, programa: Programa): DatosMes {
  return {
    mes: datos.mes,
    ventas: datos.ventas.filter((v) => v.programa === programa),
    cobros: datos.cobros.filter((c) => c.programa === programa),
    egresos: datos.egresos.filter((e) => e.programa === programa || e.programa === undefined),
  };
}
