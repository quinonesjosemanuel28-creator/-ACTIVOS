/**
 * CAPA 3 — DOMINIO · Métricas del funnel comercial (puras).
 *
 * Agendas y shows son carga manual; cerrados se deriva de los cierres reales
 * del mes (no se calcula acá: llega ya resuelto). Las tasas y los valores por
 * reunión son funciones puras. División por cero → null → "—" (no inventa).
 */
import { safeDiv } from '../money';

export interface FunnelMes {
  agendas: number;
  asistieron: number;
  cerrados: number;
}

/** Tasa de show = asistieron / agendas. */
export const tasaShow = (f: FunnelMes): number | null => safeDiv(f.asistieron, f.agendas);
/** Tasa de show a partir de agendas/shows sueltos (p. ej. por canal). */
export const tasaShowDe = (agendas: number, asistieron: number): number | null => safeDiv(asistieron, agendas);
/** Tasa de cierre = cerrados / asistieron. */
export const tasaCierre = (f: FunnelMes): number | null => safeDiv(f.cerrados, f.asistieron);
/** Tasa global = cerrados / agendas. */
export const tasaGlobal = (f: FunnelMes): number | null => safeDiv(f.cerrados, f.agendas);

/** Valor por agenda = cash nuevo / agendas. null si no hay agendas cargadas. */
export const valorPorAgenda = (cashNuevo: number, agendas: number): number | null => safeDiv(cashNuevo, agendas);
/** Valor por show = cash nuevo / asistieron. null si no hay shows cargados. */
export const valorPorShow = (cashNuevo: number, asistieron: number): number | null => safeDiv(cashNuevo, asistieron);

/** ¿El funnel tiene la carga manual (agendas/shows) hecha? */
export const tieneCargaManual = (f: FunnelMes): boolean => f.agendas > 0 || f.asistieron > 0;
