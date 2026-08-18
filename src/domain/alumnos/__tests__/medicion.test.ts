/**
 * Ticket 9A · El modelo de medición: estadoDe con fallback al booleano
 * legado. Lo que se protege: una fila anterior a la migración se lee igual
 * de bien que una nueva, y el booleano y el estado nunca se contradicen.
 */
import { describe, it, expect } from 'vitest';
import { estadoDe } from '../plan';

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
