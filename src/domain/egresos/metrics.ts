/**
 * CAPA 3 — DOMINIO · Métricas de egresos (puras, doble moneda).
 *
 * - Recurrentes: se proyectan virtualmente a cada mes desde su fecha de inicio
 *   (un solo registro plantilla; no se recargan a mano).
 * - Costo operativo = categorías 1–7. "Retiros de socios" (distribución) se
 *   separa y NO suma al costo operativo.
 * - División por cero → null (la UI muestra "—").
 */
import { safeDiv, sumBy } from '../money';
import type { Egreso, Mes } from '../types';
import { esDistribucion } from './categorias';

const mesDe = (fechaIso: string): Mes => fechaIso.slice(0, 7);
const mesEgreso = (e: Egreso): Mes => e.mes || mesDe(e.fecha);

/**
 * Egresos vigentes en un mes. Los PUNTUALES entran si su mes es el indicado.
 * Los RECURRENTES se proyectan a todos los meses ≥ su mes de inicio (se
 * devuelve una copia con el mes/fecha del período proyectado).
 */
export function egresosDelMes(egresos: readonly Egreso[], mes: Mes): Egreso[] {
  const out: Egreso[] = [];
  for (const e of egresos) {
    const inicio = mesEgreso(e);
    if (e.recurrente) {
      if (inicio <= mes) out.push({ ...e, mes, fecha: `${mes}-01` });
    } else if (inicio === mes) {
      out.push(e);
    }
  }
  return out;
}

// ───────────────────────── Totales doble moneda ─────────────────────────

export const totalUsd = (egresos: readonly Egreso[]): number => sumBy(egresos, (e) => e.montoUsd);
export const totalArs = (egresos: readonly Egreso[]): number => sumBy(egresos, (e) => e.montoArs ?? 0);

/** Cotización ponderada = Σ ARS / Σ USD, solo sobre egresos con ARS cargado. */
export function cotizacionPonderada(egresos: readonly Egreso[]): number | null {
  const conArs = egresos.filter((e) => e.montoArs !== undefined && e.montoArs !== null);
  return safeDiv(
    sumBy(conArs, (e) => e.montoArs ?? 0),
    sumBy(conArs, (e) => e.montoUsd),
  );
}

// ───────────────────── Operativo vs distribución (R: retiros) ─────────────

const operativos = (egresos: readonly Egreso[]) => egresos.filter((e) => !esDistribucion(e.categoria));
const distribuciones = (egresos: readonly Egreso[]) => egresos.filter((e) => esDistribucion(e.categoria));

/** Costo operativo (USD): categorías 1–7, excluye retiros de socios. */
export const costoOperativoUsd = (egresos: readonly Egreso[]): number => totalUsd(operativos(egresos));
export const costoOperativoArs = (egresos: readonly Egreso[]): number => totalArs(operativos(egresos));
/** Retiros de socios (distribución). */
export const distribucionUsd = (egresos: readonly Egreso[]): number => totalUsd(distribuciones(egresos));
export const distribucionArs = (egresos: readonly Egreso[]): number => totalArs(distribuciones(egresos));

// ───────────────────────── Desglose por categoría ─────────────────────────

export interface LineaCategoria {
  categoria: string;
  usd: number;
  ars: number;
  /** % sobre el total USD del conjunto (null si el total es 0). */
  pctUsd: number | null;
  esDistribucion: boolean;
}

export function totalesPorCategoria(egresos: readonly Egreso[]): LineaCategoria[] {
  const total = totalUsd(egresos);
  const mapa = new Map<string, { usd: number; ars: number }>();
  for (const e of egresos) {
    const acc = mapa.get(e.categoria) ?? { usd: 0, ars: 0 };
    acc.usd += e.montoUsd;
    acc.ars += e.montoArs ?? 0;
    mapa.set(e.categoria, acc);
  }
  return [...mapa.entries()]
    .map(([categoria, v]) => ({
      categoria,
      usd: v.usd,
      ars: v.ars,
      pctUsd: safeDiv(v.usd, total),
      esDistribucion: esDistribucion(categoria),
    }))
    .sort((a, b) => b.usd - a.usd);
}

// ───────────────────────── Resumen del período ─────────────────────────

export interface ResumenEgresos {
  totalUsd: number;
  totalArs: number;
  cotizacionPonderada: number | null;
  costoOperativoUsd: number;
  costoOperativoArs: number;
  distribucionUsd: number;
  distribucionArs: number;
  porCategoria: LineaCategoria[];
  cantidad: number;
}

/** Arma el resumen completo de un conjunto de egresos (ya filtrado/proyectado). */
export function resumenEgresos(egresos: readonly Egreso[]): ResumenEgresos {
  return {
    totalUsd: totalUsd(egresos),
    totalArs: totalArs(egresos),
    cotizacionPonderada: cotizacionPonderada(egresos),
    costoOperativoUsd: costoOperativoUsd(egresos),
    costoOperativoArs: costoOperativoArs(egresos),
    distribucionUsd: distribucionUsd(egresos),
    distribucionArs: distribucionArs(egresos),
    porCategoria: totalesPorCategoria(egresos),
    cantidad: egresos.length,
  };
}
