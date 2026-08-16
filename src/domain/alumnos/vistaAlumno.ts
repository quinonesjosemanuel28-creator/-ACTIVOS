/**
 * CAPA 3 — DOMINIO · Módulo de alumnos · La vista del alumno (ticket 8).
 *
 * Lo que el LINK le dice al alumno que haga. La regla dura del ticket: esta
 * vista orienta, no alarma — acá no hay semáforo, ni colores de alerta, ni
 * porcentajes de atraso. El consultor necesita una alarma; el alumno necesita
 * una salida. Si el link lo hace sentir en falta, deja de abrirlo, y ahí se
 * pierde la señal entera que alimenta el panel.
 *
 * Todo puro: recibe fases con su estado de tildes y el "hoy", devuelve qué
 * mostrar. Ningún cálculo de salud vive acá (ese es de panel.ts y es material
 * del consultor).
 */
import { DIAS_PLAN, type Fase } from './plan';
import { diasDelPlan } from './panel';

/** Lo mínimo que la selección necesita saber de una acción. */
export interface AccionSeleccionable {
  hecha: boolean;
}

export interface FaseParaVista<T extends AccionSeleccionable> {
  fase: Fase;
  acciones: T[];
}

/**
 * Con 22 casillas vacías el alumno no arranca; con tres, sí. Las demás quedan
 * abajo para el que quiera el panorama completo.
 */
export const CUPO_ESTA_SEMANA = 3;

/**
 * Deuda de fases VENCIDAS por calendario: pendientes de fases anteriores a la
 * actual, de la más vieja a la más nueva. Vacía = va al día.
 */
export function deudaVencida<T extends AccionSeleccionable>(
  fases: FaseParaVista<T>[],
  faseActual: Fase,
): { fase: Fase; pendientes: number }[] {
  return [...fases]
    .sort((a, b) => a.fase - b.fase)
    .filter((f) => f.fase < faseActual)
    .map((f) => ({ fase: f.fase, pendientes: f.acciones.filter((a) => !a.hecha).length }))
    .filter((d) => d.pendientes > 0);
}

/**
 * Las 3 acciones del bloque "Esta semana", en orden de prioridad:
 *
 *  1. pendientes de fases YA VENCIDAS (la deuda), de la más vieja a la más nueva;
 *  2. pendientes de la fase actual;
 *  3. si va al día y sobran cupos, las primeras de las fases siguientes.
 *
 * Si quedan menos de 3 pendientes en total, van las que haya; con cero, el
 * bloque no se muestra (eso lo decide la vista).
 */
export function seleccionarEstaSemana<T extends AccionSeleccionable>(
  fases: FaseParaVista<T>[],
  faseActual: Fase,
  cupo = CUPO_ESTA_SEMANA,
): T[] {
  const orden = [...fases].sort((a, b) => a.fase - b.fase);
  const pendientesDe = (filtro: (fase: Fase) => boolean): T[] =>
    orden.filter((f) => filtro(f.fase)).flatMap((f) => f.acciones.filter((a) => !a.hecha));
  return [
    ...pendientesDe((f) => f < faseActual),
    ...pendientesDe((f) => f === faseActual),
    ...pendientesDe((f) => f > faseActual),
  ].slice(0, cupo);
}

/**
 * Qué fase aterriza ABIERTA: la que contiene la acción más urgente. Con deuda
 * de fases vencidas, la fase con deuda más vieja; al día, la fase actual.
 * (El badge "estás acá" sigue en la fase por calendario — eso no cambia.)
 */
export function faseAAbrir<T extends AccionSeleccionable>(fases: FaseParaVista<T>[], faseActual: Fase): Fase {
  return deudaVencida(fases, faseActual)[0]?.fase ?? faseActual;
}

/**
 * El día del plan, listo para decir "Día 37 de 90 · te quedan 53" sin que el
 * alumno haga la cuenta. El día se acota a [1, 90]: pasado el trimestre la
 * cabecera dice "día 90 de 90" con `finalizado` en true.
 */
export function diaDelPlan(
  fechaInicio: string,
  hoyIso: string,
): { dia: number; restantes: number; finalizado: boolean } {
  const crudo = diasDelPlan(fechaInicio, hoyIso) + 1; // día 1 = el día del arranque
  const dia = Math.min(Math.max(crudo, 1), DIAS_PLAN);
  return { dia, restantes: DIAS_PLAN - dia, finalizado: crudo > DIAS_PLAN };
}
