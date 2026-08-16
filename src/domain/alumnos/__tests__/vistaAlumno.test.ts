/**
 * La vista del alumno (ticket 8): el bloque "Esta semana", la deuda de fases
 * vencidas, qué fase aterriza abierta y el día del plan.
 *
 * El caso que motiva el ticket, fijado como test: día 37 (Fase 2) con 6 de 8
 * de Fase 1 sin marcar — el bloque tiene que arrancar por esa deuda, y la
 * Fase 1 tiene que aterrizar abierta.
 */
import { describe, it, expect } from 'vitest';
import { CUPO_ESTA_SEMANA, deudaVencida, diaDelPlan, faseAAbrir, seleccionarEstaSemana } from '../vistaAlumno';
import type { Fase } from '../plan';

type A = { id: string; hecha: boolean };
const acciones = (fase: Fase, hechas: number, total: number): { fase: Fase; acciones: A[] } => ({
  fase,
  acciones: Array.from({ length: total }, (_, i) => ({ id: `f${fase}-a${i + 1}`, hecha: i < hechas })),
});

describe('Vista del alumno · Esta semana', () => {
  it('caso del ticket: día 37, 6 de 8 de Fase 1 pendientes → el bloque son 3 de esas 6', () => {
    const fases = [acciones(1, 2, 8), acciones(2, 0, 8), acciones(3, 0, 8)];
    const semana = seleccionarEstaSemana(fases, 2);
    expect(semana).toHaveLength(CUPO_ESTA_SEMANA);
    expect(semana.map((a) => a.id)).toEqual(['f1-a3', 'f1-a4', 'f1-a5']); // la deuda primero
    expect(faseAAbrir(fases, 2)).toBe(1); // aterriza abierta la fase con deuda más vieja
    expect(deudaVencida(fases, 2)).toEqual([{ fase: 1, pendientes: 6 }]);
  });

  it('la deuda más vieja va primero aunque haya deuda en dos fases', () => {
    const fases = [acciones(1, 7, 8), acciones(2, 6, 8), acciones(3, 0, 8)];
    const semana = seleccionarEstaSemana(fases, 3);
    expect(semana.map((a) => a.id)).toEqual(['f1-a8', 'f2-a7', 'f2-a8']);
    expect(faseAAbrir(fases, 3)).toBe(1);
    expect(deudaVencida(fases, 3)).toEqual([{ fase: 1, pendientes: 1 }, { fase: 2, pendientes: 2 }]);
  });

  it('al día: el bloque toma de la fase actual, sin deuda, y la fase actual queda abierta', () => {
    const fases = [acciones(1, 8, 8), acciones(2, 1, 8), acciones(3, 0, 8)];
    const semana = seleccionarEstaSemana(fases, 2);
    expect(semana.map((a) => a.id)).toEqual(['f2-a2', 'f2-a3', 'f2-a4']);
    expect(deudaVencida(fases, 2)).toEqual([]);
    expect(faseAAbrir(fases, 2)).toBe(2);
  });

  it('al día y con la fase actual terminada: completa cupo con la fase siguiente', () => {
    const fases = [acciones(1, 8, 8), acciones(2, 7, 8), acciones(3, 0, 8)];
    expect(seleccionarEstaSemana(fases, 2).map((a) => a.id)).toEqual(['f2-a8', 'f3-a1', 'f3-a2']);
  });

  it('con menos de 3 pendientes en total muestra las que haya; con cero, ninguna', () => {
    const fases = [acciones(1, 8, 8), acciones(2, 8, 8), acciones(3, 7, 8)];
    expect(seleccionarEstaSemana(fases, 3).map((a) => a.id)).toEqual(['f3-a8']);
    expect(seleccionarEstaSemana([acciones(1, 8, 8), acciones(2, 8, 8), acciones(3, 8, 8)], 3)).toEqual([]);
  });

  it('el orden de las fases en el payload no importa: se ordena por número', () => {
    const fases = [acciones(3, 0, 3), acciones(1, 0, 3), acciones(2, 0, 3)];
    expect(seleccionarEstaSemana(fases, 2).map((a) => a.id)).toEqual(['f1-a1', 'f1-a2', 'f1-a3']);
  });
});

describe('Vista del alumno · día del plan', () => {
  it('hace la cuenta que el alumno no hace: día 37 → quedan 53', () => {
    expect(diaDelPlan('2026-07-11', '2026-08-16T12:00:00.000Z')).toEqual({ dia: 37, restantes: 53, finalizado: false });
  });

  it('el día del arranque es el día 1; pasado el 90 se clava en 90 con finalizado', () => {
    expect(diaDelPlan('2026-08-16', '2026-08-16T09:00:00.000Z')).toEqual({ dia: 1, restantes: 89, finalizado: false });
    expect(diaDelPlan('2026-05-19', '2026-08-16T00:00:00.000Z')).toEqual({ dia: 90, restantes: 0, finalizado: false });
    expect(diaDelPlan('2026-05-01', '2026-08-16T00:00:00.000Z')).toEqual({ dia: 90, restantes: 0, finalizado: true });
  });
});
