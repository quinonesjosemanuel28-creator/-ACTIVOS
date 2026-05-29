/**
 * CAPA 3 — DOMINIO · Módulo "Cierres y Clientes" · Métricas doble moneda.
 *
 * Funciones puras. Toda métrica de cash existe en USD y en ARS. El ARS es
 * el dinero REALMENTE cobrado (base futura de comisiones); el USD es el
 * comprometido/equivalente. División por cero → `null` (la UI muestra "—").
 *
 * Reusa los helpers numéricos del núcleo (safeDiv, sumBy) — no se reinventan.
 */
import { safeDiv, sumBy } from '../money';
import type { Mes } from '../types';
import type { Cierre, EstadoSaldo, Pago } from './types';

/** Mes (YYYY-MM) de una fecha ISO. */
const mesDe = (fechaIso: string): Mes => fechaIso.slice(0, 7);

/** Pagos cuya fecha cae en el mes indicado. */
export function pagosDelMes(pagos: readonly Pago[], mes: Mes): Pago[] {
  return pagos.filter((p) => mesDe(p.fechaPago) === mes);
}

/** Pagos de un cierre puntual. */
export function pagosDeCierre(pagos: readonly Pago[], idCierre: string): Pago[] {
  return pagos.filter((p) => p.idCierre === idCierre);
}

// ───────────────────────── Cash Collected (mes) ─────────────────────────

/** Cash Collected USD del mes = Σ monto_usd de pagos con fecha en el mes. */
export function cashCollectedUsd(pagos: readonly Pago[], mes: Mes): number {
  return sumBy(pagosDelMes(pagos, mes), (p) => p.montoUsd);
}

/** Cash Collected ARS del mes = Σ monto_ars (real cobrado) de pagos del mes. */
export function cashCollectedArs(pagos: readonly Pago[], mes: Mes): number {
  return sumBy(pagosDelMes(pagos, mes), (p) => p.montoArs ?? 0);
}

/**
 * Cotización promedio ponderada de un conjunto de pagos = Σ ars / Σ usd.
 * Solo considera pagos que tienen monto_ars cargado (los migrados sin ARS
 * no distorsionan el promedio). null si no hay base en ARS.
 */
export function cotizacionPonderada(pagos: readonly Pago[]): number | null {
  const conArs = pagos.filter((p) => p.montoArs !== undefined && p.montoArs !== null);
  return safeDiv(
    sumBy(conArs, (p) => p.montoArs ?? 0),
    sumBy(conArs, (p) => p.montoUsd),
  );
}

/** Cotización ponderada del mes. */
export function cotizacionPonderadaMes(pagos: readonly Pago[], mes: Mes): number | null {
  return cotizacionPonderada(pagosDelMes(pagos, mes));
}

// ───────────────────── Cash Nuevo vs Cohortes (doble moneda) ─────────────

/** Mapa idCierre → mes del cierre, para clasificar nuevo vs cohorte. */
function mapaMesCierre(cierres: readonly Cierre[]): Map<string, Mes> {
  return new Map(cierres.map((c) => [c.idCierre, mesDe(c.fechaCierre)]));
}

/**
 * Cash Nuevo = pagos del mes cuyo cierre es del MISMO mes (motor nuevo).
 * Cohortes = pagos del mes de cierres anteriores. Misma lógica que el
 * núcleo, pero leída desde pagos/cierres y disponible en ambas monedas.
 */
function partirNuevoCohorte(
  cierres: readonly Cierre[],
  pagos: readonly Pago[],
  mes: Mes,
  monto: (p: Pago) => number,
): { nuevo: number; cohortes: number } {
  const mesPorCierre = mapaMesCierre(cierres);
  const delMes = pagosDelMes(pagos, mes);
  let nuevo = 0;
  let cohortes = 0;
  for (const p of delMes) {
    const mesCierre = mesPorCierre.get(p.idCierre);
    const v = monto(p);
    if (mesCierre === mes) nuevo += v;
    else cohortes += v;
  }
  return { nuevo, cohortes };
}

export const cashNuevoUsd = (cierres: readonly Cierre[], pagos: readonly Pago[], mes: Mes): number =>
  partirNuevoCohorte(cierres, pagos, mes, (p) => p.montoUsd).nuevo;
export const cohortesUsd = (cierres: readonly Cierre[], pagos: readonly Pago[], mes: Mes): number =>
  partirNuevoCohorte(cierres, pagos, mes, (p) => p.montoUsd).cohortes;
export const cashNuevoArs = (cierres: readonly Cierre[], pagos: readonly Pago[], mes: Mes): number =>
  partirNuevoCohorte(cierres, pagos, mes, (p) => p.montoArs ?? 0).nuevo;
export const cohortesArs = (cierres: readonly Cierre[], pagos: readonly Pago[], mes: Mes): number =>
  partirNuevoCohorte(cierres, pagos, mes, (p) => p.montoArs ?? 0).cohortes;

// ───────────────────────── Por cierre ─────────────────────────

/** Total pagado de un cierre en USD. */
export function totalPagadoUsd(idCierre: string, pagos: readonly Pago[]): number {
  return sumBy(pagosDeCierre(pagos, idCierre), (p) => p.montoUsd);
}

/** Total pagado de un cierre en ARS (real cobrado). */
export function totalPagadoArs(idCierre: string, pagos: readonly Pago[]): number {
  return sumBy(pagosDeCierre(pagos, idCierre), (p) => p.montoArs ?? 0);
}

/** Pendiente del cierre = ticket_total_usd − total pagado USD. */
export function pendienteUsd(cierre: Cierre, pagos: readonly Pago[]): number {
  return cierre.ticketTotalUsd - totalPagadoUsd(cierre.idCierre, pagos);
}

/** Estado de saldo para el badge del listado. */
export function estadoSaldo(cierre: Cierre, pagos: readonly Pago[]): EstadoSaldo {
  const propios = pagosDeCierre(pagos, cierre.idCierre);
  if (propios.length === 0) return 'sin-pagos';
  const pagado = totalPagadoUsd(cierre.idCierre, pagos);
  if (pagado >= cierre.ticketTotalUsd) return 'saldado';
  const soloSeña = propios.every((p) => p.tipoPago === 'Reserva/Seña');
  return soloSeña ? 'solo-seña' : 'parcial';
}

// ───────────────────────── Ventas Nuevas (comprometido) ─────────────────

/** Ventas Nuevas USD del mes = Σ ticket_total_usd de cierres del mes. */
export function ventasNuevasUsd(cierres: readonly Cierre[], mes: Mes): number {
  return sumBy(
    cierres.filter((c) => mesDe(c.fechaCierre) === mes),
    (c) => c.ticketTotalUsd,
  );
}

// ─────────────── Acumulado ARS por closer / setter (base comisiones) ──────

/**
 * Acumulado de ARS realmente cobrado por persona en un mes, atribuido por
 * el closer/setter del cierre origen de cada pago. BASE FUTURA para
 * comisiones — se calcula y queda disponible; el % aún NO se aplica acá.
 */
function acumuladoArsPor(
  cierres: readonly Cierre[],
  pagos: readonly Pago[],
  mes: Mes,
  rol: (c: Cierre) => string | undefined,
): Record<string, number> {
  const cierrePorId = new Map(cierres.map((c) => [c.idCierre, c]));
  const acc: Record<string, number> = {};
  for (const p of pagosDelMes(pagos, mes)) {
    const cierre = cierrePorId.get(p.idCierre);
    if (!cierre) continue;
    const persona = rol(cierre) ?? 'sin-asignar';
    acc[persona] = (acc[persona] ?? 0) + (p.montoArs ?? 0);
  }
  return acc;
}

export const acumuladoArsPorCloser = (cierres: readonly Cierre[], pagos: readonly Pago[], mes: Mes) =>
  acumuladoArsPor(cierres, pagos, mes, (c) => c.closer);
export const acumuladoArsPorSetter = (cierres: readonly Cierre[], pagos: readonly Pago[], mes: Mes) =>
  acumuladoArsPor(cierres, pagos, mes, (c) => c.setter);

/** Cantidad de cierres nuevos del mes. */
export function cierresNuevos(cierres: readonly Cierre[], mes: Mes): number {
  return cierres.filter((c) => mesDe(c.fechaCierre) === mes).length;
}
