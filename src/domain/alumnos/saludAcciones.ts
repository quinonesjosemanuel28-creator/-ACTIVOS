/**
 * CAPA 3 — DOMINIO · Módulo de alumnos · Semáforo por acciones (ticket 9C).
 *
 * El cálculo NUEVO, corriendo en paralelo y sin exponer: mide acciones
 * ejecutadas contra lo que la agenda del plan esperaba a hoy. El semáforo que
 * se MUESTRA sigue siendo el de panel.ts (KRs tildados por el consultor)
 * hasta el switch de 9C — este módulo existe para poder mirar los dos valores
 * lado a lado durante una semana antes de decidir.
 *
 * Por qué el tiempo NO es días/90: al pasar el numerador a acciones, el
 * denominador del tiempo es la AGENDA del plan, porque el reparto por fase es
 * libre. Con días/90, dos alumnos igual de perfectos con repartos 3/8/8 y
 * 8/3/3 dan colores distintos (TICKET-9.md §3.1). Acá:
 *
 *   avance    = ejecutadas / totales        (solo 'ejecutado' puntúa)
 *   esperadas = fases YA vencidas completas + fase actual × fracción
 *   tiempo    = esperadas / totales
 *   brecha    = avance − tiempo             (umbrales de panel.ts, sin tocar)
 *
 * Propiedad fijada en test: con reparto parejo es idéntico a min(días/90, 1).
 * `en_curso` no puntúa a propósito: si sumara medio punto, marcar todo "en
 * curso" en una tarde mostraría 50% de avance sin terminar nada.
 */
import { DIAS_SIN_JUZGAR, diasDelPlan, saludDeBrecha, type EstadoAlumno, type Salud } from './panel';
import { estadoAcciones, estadoDe, type Accion, type Checkin, type Fase } from './plan';

/** La agenda del plan reducida a números: cuántas acciones por fase y cuántas cerradas. */
export interface AccionesPorFase {
  fase: Fase;
  totales: number;
  ejecutadas: number;
}

/** Como MotivoNeutro de panel.ts, con 'sin_acciones' en lugar de 'sin_krs'. */
export type MotivoNeutroAcciones = 'sin_plan' | 'sin_acciones' | 'primeros_dias' | 'estado';

export interface SaludPorAcciones {
  /** null = neutro: no hay datos suficientes o el estado lo apaga. */
  salud: Salud | null;
  motivo?: MotivoNeutroAcciones;
  /** avance − tiempo, cuando se pudo calcular. Negativa = atrasado. */
  brecha?: number;
  /** Los números detrás de la brecha, para el export de comparación. */
  avance?: number;
  tiempo?: number;
}

export interface EntradaSaludAcciones {
  estado: EstadoAlumno;
  /** null = sin plan cargado. */
  fechaInicio: string | null;
  porFase: readonly AccionesPorFase[];
}

/**
 * esperadas / totales. Cada fase dura 30 días: la fase i (1..3) corre en
 * [30·(i−1), 30·i) contado con el mismo `diasDelPlan` del semáforo viejo
 * (0 = día del arranque). Continua en los bordes de fase: el día 30, la
 * fase 1 completa y la fase 2 al 0% dan el mismo valor.
 */
export function tiempoAgenda(porFase: readonly AccionesPorFase[], dias: number): number {
  const totales = porFase.reduce((s, f) => s + f.totales, 0);
  if (totales === 0) return 0;
  if (dias >= 90) return 1;
  if (dias < 0) return 0;
  const enCurso = Math.floor(dias / 30); // fase actual, 0-based
  let esperadas = 0;
  for (const f of porFase) {
    if (f.fase - 1 < enCurso) esperadas += f.totales;
    else if (f.fase - 1 === enCurso) esperadas += f.totales * ((dias - enCurso * 30) / 30);
  }
  return esperadas / totales;
}

/**
 * El semáforo nuevo. Mismos umbrales, misma gracia de 7 días y mismos neutros
 * que calcularSalud — cambia UNA variable: qué se mide (acciones ejecutadas
 * contra la agenda, en vez de KRs tildados contra días/90).
 */
export function calcularSaludPorAcciones(e: EntradaSaludAcciones, hoyIso: string): SaludPorAcciones {
  if (e.estado !== 'ACTIVO') return { salud: null, motivo: 'estado' };
  if (e.fechaInicio === null) return { salud: null, motivo: 'sin_plan' };
  const totales = e.porFase.reduce((s, f) => s + f.totales, 0);
  if (totales === 0) return { salud: null, motivo: 'sin_acciones' };
  const dias = diasDelPlan(e.fechaInicio, hoyIso);
  if (dias < DIAS_SIN_JUZGAR) return { salud: null, motivo: 'primeros_dias' };

  const ejecutadas = e.porFase.reduce((s, f) => s + f.ejecutadas, 0);
  const avance = ejecutadas / totales;
  const tiempo = tiempoAgenda(e.porFase, dias);
  const brecha = avance - tiempo;
  return { salud: saludDeBrecha(brecha), brecha, avance, tiempo };
}

/**
 * Reduce el plan y su historial a la entrada del cálculo: cuántas acciones
 * agenda cada fase y cuántas están ejecutadas HOY (gana el checkin más nuevo
 * de cada acción, vía estadoAcciones — la misma reducción del panel y el
 * link). Las tres fases aparecen siempre, aunque estén vacías.
 */
export function accionesPorFase(
  acciones: readonly Pick<Accion, 'id' | 'fase'>[],
  checkins: readonly Checkin[],
): AccionesPorFase[] {
  const estados = estadoAcciones(checkins);
  const fases: AccionesPorFase[] = ([1, 2, 3] as const).map((fase) => ({ fase, totales: 0, ejecutadas: 0 }));
  for (const a of acciones) {
    const f = fases[a.fase - 1]!;
    f.totales += 1;
    const ultimo = estados.get(a.id);
    if (ultimo && estadoDe(ultimo) === 'ejecutado') f.ejecutadas += 1;
  }
  return fases;
}
