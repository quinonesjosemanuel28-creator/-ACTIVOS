/**
 * CAPA 3 — DOMINIO · Módulo de alumnos · El panel de control (ticket 7).
 *
 * Estado del alumno, semáforo de salud y orden por riesgo. Todo puro: recibe
 * el "hoy" en vez de leerlo, igual que el resto del dominio del plan.
 *
 * El criterio rector del ticket: el panel tiene que gritar por los alumnos que
 * se TRABARON, no por los que están cerca del cierre. Por eso la salud compara
 * avance contra tiempo transcurrido (brecha), y no avance contra 100%: un 15%
 * de KRs en el día 45 es rojo HOY, no recién en el día 61.
 */
import type { Kr } from './plan';

// ───────────────────────── Estado del alumno ─────────────────────────

/**
 * Ciclo de vida del alumno en la consultoría. Estructural (siempre estos 4),
 * así que lleva CHECK en la base — como diagnosticos.origen, no como las
 * opciones de negocio que se validan solo en Zod.
 */
export type EstadoAlumno = 'ACTIVO' | 'PAUSADO' | 'FINALIZADO' | 'ABANDONADO';

export const ESTADOS_ALUMNO: readonly EstadoAlumno[] = ['ACTIVO', 'PAUSADO', 'FINALIZADO', 'ABANDONADO'] as const;

export function esEstadoAlumno(v: unknown): v is EstadoAlumno {
  return typeof v === 'string' && (ESTADOS_ALUMNO as readonly string[]).includes(v);
}

// ───────────────────────── Días y fase ─────────────────────────

/** Días transcurridos desde el inicio del plan (0 = el día del arranque). */
export function diasDelPlan(fechaInicio: string, hoyIso: string): number {
  const inicio = Date.parse(`${fechaInicio}T00:00:00Z`);
  const hoy = Date.parse(`${hoyIso.slice(0, 10)}T00:00:00Z`);
  return Math.floor((hoy - inicio) / 86_400_000);
}

/**
 * Texto del chip de fase. Neutro a propósito (gris, sin color): dice DÓNDE
 * está el alumno, no cómo va — para "cómo va" está la salud.
 */
export type ChipFase = 'Fase 1' | 'Fase 2' | 'Fase 3' | 'Vencido';

export function chipFase(fechaInicio: string, hoyIso: string): ChipFase {
  const dias = diasDelPlan(fechaInicio, hoyIso);
  if (dias >= 90) return 'Vencido';
  if (dias >= 60) return 'Fase 3';
  if (dias >= 30) return 'Fase 2';
  return 'Fase 1';
}

// ───────────────────────── Salud (el semáforo) ─────────────────────────

export type Salud = 'VERDE' | 'NARANJA' | 'ROJO';

/** Por qué no hay semáforo (el neutro siempre dice su motivo). */
export type MotivoNeutro = 'sin_plan' | 'sin_krs' | 'primeros_dias' | 'estado';

export interface SaludCalculada {
  /** null = neutro: no hay datos suficientes o el estado lo apaga. */
  salud: Salud | null;
  motivo?: MotivoNeutro;
  /** avance - tiempo, cuando se pudo calcular. Negativa = atrasado. */
  brecha?: number;
}

/**
 * Umbrales de la brecha (avance − tiempo). Punto de partida acordado en el
 * ticket 7; si pintan de rojo a gente que va bien, se ajustan acá.
 */
export const UMBRAL_NARANJA = -0.1;
export const UMBRAL_ROJO = -0.25;

/** Primeros días sin juzgar: no hay datos suficientes para un semáforo. */
export const DIAS_SIN_JUZGAR = 7;

export interface EntradaSalud {
  estado: EstadoAlumno;
  /** null = sin plan cargado. */
  fechaInicio: string | null;
  krsTotales: number;
  krsCumplidos: number;
}

/**
 * El semáforo. `avance = cumplidos/totales`, `tiempo = min(dias/90, 1)`,
 * `brecha = avance − tiempo`:
 *
 *   brecha ≥ −0.10 → VERDE · −0.25 ≤ brecha < −0.10 → NARANJA · < −0.25 → ROJO
 *
 * Neutro (sin semáforo) cuando: el estado no es ACTIVO (pausar congela el
 * juicio), no hay plan, el plan no tiene KRs, o van menos de 7 días.
 */
export function calcularSalud(e: EntradaSalud, hoyIso: string): SaludCalculada {
  if (e.estado !== 'ACTIVO') return { salud: null, motivo: 'estado' };
  if (e.fechaInicio === null) return { salud: null, motivo: 'sin_plan' };
  if (e.krsTotales === 0) return { salud: null, motivo: 'sin_krs' };
  const dias = diasDelPlan(e.fechaInicio, hoyIso);
  if (dias < DIAS_SIN_JUZGAR) return { salud: null, motivo: 'primeros_dias' };

  const avance = e.krsCumplidos / e.krsTotales;
  const tiempo = Math.min(dias / 90, 1);
  const brecha = avance - tiempo;
  if (brecha >= UMBRAL_NARANJA) return { salud: 'VERDE', brecha };
  if (brecha >= UMBRAL_ROJO) return { salud: 'NARANJA', brecha };
  return { salud: 'ROJO', brecha };
}

/** Avance de KRs de un plan: el numerador y denominador de la salud. */
export function avanceKrs(krs: readonly Pick<Kr, 'cumplidoEn'>[]): { totales: number; cumplidos: number } {
  return { totales: krs.length, cumplidos: krs.filter((k) => k.cumplidoEn !== null).length };
}

// ───────────────────────── Orden por riesgo ─────────────────────────

/**
 * Puntaje para el ORDER BY del panel: menor = más arriba. Rojos primero,
 * después naranjas, neutros de alumno activo, verdes, y al fondo los estados
 * que no corren (pausado / finalizado / abandonado). Es lo que separa un panel
 * de control de un listado alfabético.
 */
export function puntajeRiesgo(estado: EstadoAlumno, salud: Salud | null): number {
  if (estado === 'ACTIVO') {
    if (salud === 'ROJO') return 1;
    if (salud === 'NARANJA') return 2;
    if (salud === null) return 3;
    return 4; // VERDE
  }
  if (estado === 'PAUSADO') return 5;
  if (estado === 'FINALIZADO') return 6;
  return 7; // ABANDONADO
}
