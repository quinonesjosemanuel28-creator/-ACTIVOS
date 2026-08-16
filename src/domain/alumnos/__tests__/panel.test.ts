/**
 * El panel de control (ticket 7): semáforo de salud, fase y orden por riesgo.
 *
 * Lo que se protege acá: que el rojo aparezca el día 20 y no el 61 (la brecha
 * compara contra el tiempo transcurrido, no contra el 100%), que los primeros
 * 7 días nadie sea juzgado, que pausar congele el semáforo, y que el orden del
 * panel ponga a los trabados arriba.
 */
import { describe, it, expect } from 'vitest';
import {
  calcularSalud,
  chipFase,
  diasDelPlan,
  avanceKrs,
  puntajeRiesgo,
  DIAS_SIN_JUZGAR,
  type EntradaSalud,
} from '../panel';
import { diasEntre, fechaCierreEstimada, sumarDias } from '../plan';

/** Un plan que arrancó hace `dias` días, visto desde HOY fijo. */
const HOY = '2026-08-16T12:00:00.000Z';
const inicioHace = (dias: number) => sumarDias(HOY.slice(0, 10), -dias);

const activo = (over: Partial<EntradaSalud> = {}): EntradaSalud => ({
  estado: 'ACTIVO',
  fechaInicio: inicioHace(45),
  krsTotales: 10,
  krsCumplidos: 5,
  ...over,
});

describe('Panel · salud (la brecha avance − tiempo)', () => {
  it('criterio de aceptación: día 45 con 15% de KRs → ROJO (no espera al día 61)', () => {
    const s = calcularSalud(activo({ fechaInicio: inicioHace(45), krsTotales: 20, krsCumplidos: 3 }), HOY);
    expect(s.salud).toBe('ROJO'); // brecha = 0.15 − 0.5 = −0.35
  });

  it('criterio de aceptación: día 75 con 80% de KRs → VERDE', () => {
    const s = calcularSalud(activo({ fechaInicio: inicioHace(75), krsTotales: 10, krsCumplidos: 8 }), HOY);
    expect(s.salud).toBe('VERDE'); // brecha = 0.8 − 0.833 = −0.03
  });

  it('criterio de aceptación: día 3 → neutro sin importar el avance', () => {
    expect(calcularSalud(activo({ fechaInicio: inicioHace(3), krsCumplidos: 0 }), HOY)).toEqual({
      salud: null,
      motivo: 'primeros_dias',
    });
    expect(calcularSalud(activo({ fechaInicio: inicioHace(3), krsCumplidos: 10 }), HOY).salud).toBeNull();
    // El día 7 exacto ya se juzga (0-index: dias === DIAS_SIN_JUZGAR).
    expect(calcularSalud(activo({ fechaInicio: inicioHace(DIAS_SIN_JUZGAR) }), HOY).salud).not.toBeNull();
  });

  it('los umbrales cortan donde dice el ticket: −10% y −25%', () => {
    // Día 45 → tiempo 0.5. Avance 0.40 → brecha −0.10 = VERDE (el borde es inclusivo).
    expect(calcularSalud(activo({ krsTotales: 100, krsCumplidos: 40 }), HOY).salud).toBe('VERDE');
    // 0.39 → −0.11 = NARANJA.
    expect(calcularSalud(activo({ krsTotales: 100, krsCumplidos: 39 }), HOY).salud).toBe('NARANJA');
    // 0.25 → −0.25 = NARANJA (el borde del rojo es exclusivo).
    expect(calcularSalud(activo({ krsTotales: 100, krsCumplidos: 25 }), HOY).salud).toBe('NARANJA');
    // 0.24 → −0.26 = ROJO.
    expect(calcularSalud(activo({ krsTotales: 100, krsCumplidos: 24 }), HOY).salud).toBe('ROJO');
  });

  it('pasado el día 90 el tiempo se clava en 1: solo el 90%+ de KRs queda verde', () => {
    const s = calcularSalud(activo({ fechaInicio: inicioHace(120), krsTotales: 10, krsCumplidos: 9 }), HOY);
    expect(s.salud).toBe('VERDE');
    expect(calcularSalud(activo({ fechaInicio: inicioHace(120), krsTotales: 10, krsCumplidos: 6 }), HOY).salud).toBe('ROJO');
  });

  it('solo ACTIVO tiene semáforo: pausar/finalizar/abandonar lo apagan', () => {
    for (const estado of ['PAUSADO', 'FINALIZADO', 'ABANDONADO'] as const) {
      expect(calcularSalud(activo({ estado, krsCumplidos: 0 }), HOY)).toEqual({ salud: null, motivo: 'estado' });
    }
  });

  it('sin plan o sin KRs → neutro con su motivo (nunca un rojo inventado)', () => {
    expect(calcularSalud(activo({ fechaInicio: null }), HOY).motivo).toBe('sin_plan');
    expect(calcularSalud(activo({ krsTotales: 0, krsCumplidos: 0 }), HOY).motivo).toBe('sin_krs');
  });
});

describe('Panel · fase y fechas', () => {
  it('el chip dice dónde está: 1-30 / 31-60 / 61-90 / vencido', () => {
    expect(chipFase(inicioHace(0), HOY)).toBe('Fase 1');
    expect(chipFase(inicioHace(29), HOY)).toBe('Fase 1');
    expect(chipFase(inicioHace(30), HOY)).toBe('Fase 2');
    expect(chipFase(inicioHace(59), HOY)).toBe('Fase 2');
    expect(chipFase(inicioHace(60), HOY)).toBe('Fase 3');
    expect(chipFase(inicioHace(89), HOY)).toBe('Fase 3');
    expect(chipFase(inicioHace(90), HOY)).toBe('Vencido');
  });

  it('diasDelPlan y las fechas derivadas', () => {
    expect(diasDelPlan('2026-08-01', HOY)).toBe(15);
    expect(fechaCierreEstimada('2026-08-01')).toBe('2026-10-30');
    expect(sumarDias('2026-08-31', 10)).toBe('2026-09-10');
    expect(diasEntre('2026-08-01', '2026-08-11')).toBe(10);
    expect(diasEntre('2026-08-11', '2026-08-01')).toBe(-10);
  });

  it('avanceKrs cuenta cumplidos por cumplidoEn, no por otra cosa', () => {
    expect(avanceKrs([{ cumplidoEn: HOY }, { cumplidoEn: null }, { cumplidoEn: HOY }])).toEqual({
      totales: 3,
      cumplidos: 2,
    });
  });
});

describe('Panel · orden por riesgo', () => {
  it('trabados arriba, después naranjas, neutros, verdes, y al fondo los estados quietos', () => {
    const orden = [
      puntajeRiesgo('ACTIVO', 'ROJO'),
      puntajeRiesgo('ACTIVO', 'NARANJA'),
      puntajeRiesgo('ACTIVO', null),
      puntajeRiesgo('ACTIVO', 'VERDE'),
      puntajeRiesgo('PAUSADO', null),
      puntajeRiesgo('FINALIZADO', null),
      puntajeRiesgo('ABANDONADO', null),
    ];
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    expect(new Set(orden).size).toBe(orden.length); // sin empates entre categorías
  });
});
