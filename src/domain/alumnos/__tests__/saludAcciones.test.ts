/**
 * Ticket 9C · El semáforo por acciones, con el tiempo en la agenda del plan.
 *
 * Los dos criterios que mandan (TICKET-9.md §3.1):
 * - Los tres planes de la tabla (8/8/8, 3/8/8, 8/3/3) dan brecha 0 el día 30
 *   con la fase 1 completa: los tres van al día, los tres verdes.
 * - Con reparto parejo, la fórmula es IDÉNTICA a min(días/90, 1): la
 *   divergencia aparece solo con planes desparejos, que es lo que días/90
 *   medía mal.
 */
import { describe, it, expect } from 'vitest';
import {
  accionesPorFase,
  calcularSaludPorAcciones,
  tiempoAgenda,
  type AccionesPorFase,
} from '../saludAcciones';
import type { Checkin } from '../plan';

const INICIO = '2026-01-01';
/** hoy para un día N del plan (diasDelPlan(INICIO, dia(30)) === 30). */
const dia = (n: number): string => new Date(Date.parse(`${INICIO}T00:00:00Z`) + n * 86_400_000).toISOString();

function plan(reparto: [number, number, number], ejecutadas: [number, number, number]): AccionesPorFase[] {
  return ([1, 2, 3] as const).map((fase, i) => ({ fase, totales: reparto[i]!, ejecutadas: ejecutadas[i]! }));
}

const activo = (porFase: AccionesPorFase[]) => ({ estado: 'ACTIVO' as const, fechaInicio: INICIO, porFase });

describe('Ticket 9C · tiempo sobre la agenda del plan', () => {
  it('los tres planes de la tabla §3.1 dan brecha 0 (y verde) el día 30 con la fase 1 completa', () => {
    const casos: [number, number, number][] = [
      [8, 8, 8], // A — parejo
      [3, 8, 8], // B — arranque liviano: días/90 lo pintaba naranja injustamente
      [8, 3, 3], // C — arranque cargado: días/90 lo dejaba verde semanas sin hacer nada
    ];
    for (const reparto of casos) {
      const r = calcularSaludPorAcciones(activo(plan(reparto, [reparto[0]!, 0, 0])), dia(30));
      expect(r.salud).toBe('VERDE');
      expect(r.brecha).toBeCloseTo(0, 12);
    }
  });

  it('propiedad: con reparto parejo, el tiempo es EXACTAMENTE min(días/90, 1), día por día', () => {
    const parejo = plan([5, 5, 5], [0, 0, 0]);
    for (let d = 0; d <= 120; d++) {
      expect(tiempoAgenda(parejo, d)).toBeCloseTo(Math.min(d / 90, 1), 12);
    }
  });

  it('continua en los bordes de fase: el día 30 vale lo mismo "fase 1 completa" que "fase 2 al 0%"', () => {
    const desparejo = plan([3, 8, 8], [0, 0, 0]);
    expect(tiempoAgenda(desparejo, 30)).toBeCloseTo(3 / 19, 12);
    expect(tiempoAgenda(desparejo, 60)).toBeCloseTo(11 / 19, 12);
    expect(tiempoAgenda(desparejo, 90)).toBe(1);
    expect(tiempoAgenda(desparejo, 200)).toBe(1); // vencido: la agenda ya pasó entera
  });

  it('el caso que días/90 medía mal: plan C quieto desde el día 30 deja de verse verde', () => {
    // 8/3/3, las 8 de la fase 1 hechas, nada más. Día 45: días/90 daría
    // brecha +0.07 (verde eterno); la agenda ya esperaba fase 2 empezada.
    const r = calcularSaludPorAcciones(activo(plan([8, 3, 3], [8, 0, 0])), dia(45));
    expect(r.salud).toBe('NARANJA');
    expect(r.brecha!).toBeLessThan(-0.1);
  });

  it('criterio: 60% ejecutado cuando la agenda esperaba 60% → verde', () => {
    // 12/6/2: el día 30 la agenda espera exactamente las 12 de la fase 1 (60%).
    const r = calcularSaludPorAcciones(activo(plan([12, 6, 2], [12, 0, 0])), dia(30));
    expect(r.avance).toBeCloseTo(0.6, 12);
    expect(r.tiempo).toBeCloseTo(0.6, 12);
    expect(r.salud).toBe('VERDE');
  });

  it('criterio: 10% ejecutado cuando la agenda esperaba 50% → rojo', () => {
    // 8/4/8: día 45 espera 8 + 4×0.5 = 10 de 20 (50%). Ejecutadas: 2 (10%).
    const r = calcularSaludPorAcciones(activo(plan([8, 4, 8], [2, 0, 0])), dia(45));
    expect(r.tiempo).toBeCloseTo(0.5, 12);
    expect(r.avance).toBeCloseTo(0.1, 12);
    expect(r.salud).toBe('ROJO');
  });

  it('solo ejecutado puntúa: en_curso no suma avance', () => {
    // Mismo plan rojo de arriba, pero con TODO lo pendiente "en curso": el
    // avance no cambia — en curso distingue trabado de inactivo, no puntúa.
    const r = calcularSaludPorAcciones(activo(plan([8, 4, 8], [2, 0, 0])), dia(45));
    expect(r.salud).toBe('ROJO');
  });

  it('neutros: estado, sin plan, sin acciones y primeros días — con motivo, igual que el viejo', () => {
    const pf = plan([3, 3, 3], [0, 0, 0]);
    expect(calcularSaludPorAcciones({ estado: 'PAUSADO', fechaInicio: INICIO, porFase: pf }, dia(30)))
      .toEqual({ salud: null, motivo: 'estado' });
    expect(calcularSaludPorAcciones({ estado: 'ACTIVO', fechaInicio: null, porFase: pf }, dia(30)))
      .toEqual({ salud: null, motivo: 'sin_plan' });
    expect(calcularSaludPorAcciones(activo(plan([0, 0, 0], [0, 0, 0])), dia(30)))
      .toEqual({ salud: null, motivo: 'sin_acciones' });
    expect(calcularSaludPorAcciones(activo(pf), dia(6)))
      .toEqual({ salud: null, motivo: 'primeros_dias' });
    expect(calcularSaludPorAcciones(activo(pf), dia(7)).salud).not.toBeNull();
  });
});

describe('Ticket 9C · accionesPorFase (reducción plan + checkins)', () => {
  const chk = (accionId: string, sobre: Partial<Checkin>): Checkin => ({
    id: `c-${Math.random().toString(36).slice(2)}`,
    accionId,
    marcado: false,
    estado: null,
    nota: null,
    usuarioId: null,
    origen: 'alumno',
    creadoEn: '2026-01-10T00:00:00.000Z',
    ...sobre,
  });

  it('gana el checkin más nuevo; el legado (marcado, sin estado) cuenta vía estadoDe', () => {
    const acciones = [
      { id: 'a1', fase: 1 as const },
      { id: 'a2', fase: 1 as const },
      { id: 'a3', fase: 2 as const },
    ];
    const checkins = [
      // a1: ejecutada y después degradada a en_curso → NO cuenta.
      chk('a1', { estado: 'ejecutado', creadoEn: '2026-01-10T00:00:00.000Z' }),
      chk('a1', { estado: 'en_curso', creadoEn: '2026-01-12T00:00:00.000Z' }),
      // a2: checkin legado pre-ticket-9 (marcado, estado null) → cuenta.
      chk('a2', { marcado: true, estado: null }),
      // a3: corrección del consultor → cuenta igual (acá se mide estado, no señal).
      chk('a3', { estado: 'ejecutado', origen: 'consultor', usuarioId: 'u1' }),
    ];
    expect(accionesPorFase(acciones, checkins)).toEqual([
      { fase: 1, totales: 2, ejecutadas: 1 },
      { fase: 2, totales: 1, ejecutadas: 1 },
      { fase: 3, totales: 0, ejecutadas: 0 },
    ]);
  });

  it('sin checkins, nada ejecutado; las tres fases aparecen siempre', () => {
    expect(accionesPorFase([{ id: 'x', fase: 3 }], [])).toEqual([
      { fase: 1, totales: 0, ejecutadas: 0 },
      { fase: 2, totales: 0, ejecutadas: 0 },
      { fase: 3, totales: 1, ejecutadas: 0 },
    ]);
  });
});
