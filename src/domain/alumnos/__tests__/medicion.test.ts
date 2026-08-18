/**
 * Ticket 9A · El modelo de medición: estadoDe con fallback al booleano
 * legado. Lo que se protege: una fila anterior a la migración se lee igual
 * de bien que una nueva, y el booleano y el estado nunca se contradicen.
 */
import { describe, it, expect } from 'vitest';
import { estadoDe } from '../plan';
import { progresoMetrica } from '../medicion';

describe('Checkin · estadoDe (fallback al booleano legado)', () => {
  it('con estado presente, manda el estado', () => {
    expect(estadoDe({ estado: 'en_curso', marcado: false })).toBe('en_curso');
    expect(estadoDe({ estado: 'ejecutado', marcado: true })).toBe('ejecutado');
    expect(estadoDe({ estado: 'pendiente', marcado: false })).toBe('pendiente');
  });

  it('fila legada (estado null): el booleano decide', () => {
    expect(estadoDe({ estado: null, marcado: true })).toBe('ejecutado');
    expect(estadoDe({ estado: null, marcado: false })).toBe('pendiente');
  });
});

describe('progresoMetrica (ticket 9D · el copy de "Tus números")', () => {
  it('bajó en una métrica que baja → mejoró, con el delta para "bajó 6 puntos"', () => {
    expect(progresoMetrica('baja', 20, 14)).toEqual({ mejoro: true, delta: 6 });
  });

  it('subió en una métrica que sube → mejoró', () => {
    expect(progresoMetrica('sube', 0, 12)).toEqual({ mejoro: true, delta: 12 });
  });

  it('fue para el otro lado o no se movió → sin comentario (nunca "no llegaste")', () => {
    expect(progresoMetrica('baja', 20, 23).mejoro).toBe(false);
    expect(progresoMetrica('sube', 10, 10).mejoro).toBe(false);
  });
});
