/**
 * CAPA 3 — DOMINIO · Módulo de alumnos · El plan de 90 días.
 *
 * Entidades de la fase 2 del módulo: el plan cargado desde el bloque JSON que
 * emite la skill (CONTRATO-PLAN.md), sus OKRs con KRs, y las acciones por fase
 * que son el checklist del alumno.
 *
 * Decisiones que este modelo fija (ver MODULO-ALUMNOS.md):
 *  - Seguimiento por FASES 30/60/90, no por semanas. Las fechas de cada fase
 *    se DERIVAN de fecha_inicio; no se guardan.
 *  - Cargar un plan nuevo no borra el anterior: el alumno acumula trimestres.
 *    El vigente es el de fecha_inicio más reciente.
 *  - Los tildes (checkins) son append-only: el estado de una acción es su
 *    último checkin, y la historia nunca se pierde.
 */

export interface Plan {
  id: string;
  alumnoId: string;
  /** YYYY-MM-DD. Arranque del trimestre; de acá se derivan las tres fases. */
  fechaInicio: string;
  /** Etapa evolutiva diagnosticada (texto libre de la skill). */
  etapa: string | null;
  /** Objetivo maestro del trimestre (sección 4 del plan). */
  objetivo90d: string | null;
  /** Versión del contrato con el que se cargó el bloque. */
  version: number;
  creadoEn: string;
}

export interface Kr {
  id: string;
  okrId: string;
  orden: number;
  texto: string;
  meta: string | null;
  creadoEn: string;
}

export interface Okr {
  id: string;
  planId: string;
  orden: number;
  objetivo: string;
  creadoEn: string;
}

export type Fase = 1 | 2 | 3;

export interface Accion {
  id: string;
  planId: string;
  /** OKR al que aporta (para agrupar en el panel). Null = suelta. */
  okrId: string | null;
  fase: Fase;
  orden: number;
  texto: string;
  creadoEn: string;
}

export interface Checkin {
  id: string;
  accionId: string;
  /** true = la marcó como hecha; false = la desmarcó. */
  marcado: boolean;
  origen: 'alumno' | 'consultor';
  creadoEn: string;
}

/** El agregado completo, como lo consumen el panel y (después) el link. */
export interface PlanCompleto {
  plan: Plan;
  okrs: (Okr & { krs: Kr[] })[];
  acciones: Accion[];
}

/**
 * Fase del plan que corresponde a una fecha. Puro: recibe el "hoy" para que
 * el borde de fase sea testeable.
 *
 *  - antes de fecha_inicio → 1 (el plan todavía no arrancó: se muestra la 1)
 *  - días 0–29 → 1 · días 30–59 → 2 · días 60+ → 3 (la 3 no "termina": pasado
 *    el día 90 sigue siendo la fase visible, con el plan vencido)
 */
export function faseActual(fechaInicio: string, hoyIso: string): Fase {
  const inicio = Date.parse(`${fechaInicio}T00:00:00Z`);
  const hoy = Date.parse(`${hoyIso.slice(0, 10)}T00:00:00Z`);
  const dias = Math.floor((hoy - inicio) / 86_400_000);
  if (dias < 30) return 1;
  if (dias < 60) return 2;
  return 3;
}

/** ¿El trimestre ya terminó? (día 90 en adelante). El checklist se congela. */
export function planVencido(fechaInicio: string, hoyIso: string): boolean {
  const inicio = Date.parse(`${fechaInicio}T00:00:00Z`);
  const hoy = Date.parse(`${hoyIso.slice(0, 10)}T00:00:00Z`);
  return Math.floor((hoy - inicio) / 86_400_000) >= 90;
}
