import { describe, it, expect } from 'vitest';
import { faseActual, planVencido } from '../plan';
import { TABLAS_SENSIBLES } from '../../auth/permisos';

describe('Plan · fase actual derivada de fecha_inicio', () => {
  const INICIO = '2026-08-18';

  it('días 0-29 → fase 1 · 30-59 → 2 · 60+ → 3', () => {
    expect(faseActual(INICIO, '2026-08-18')).toBe(1); // día 0
    expect(faseActual(INICIO, '2026-09-16')).toBe(1); // día 29
    expect(faseActual(INICIO, '2026-09-17')).toBe(2); // día 30
    expect(faseActual(INICIO, '2026-10-16')).toBe(2); // día 59
    expect(faseActual(INICIO, '2026-10-17')).toBe(3); // día 60
    expect(faseActual(INICIO, '2026-12-01')).toBe(3); // pasado el 90 sigue en 3
  });

  it('antes del arranque se muestra la fase 1 (el plan todavía no corrió)', () => {
    expect(faseActual(INICIO, '2026-08-10')).toBe(1);
  });

  it('el plan vence el día 90', () => {
    expect(planVencido(INICIO, '2026-11-15')).toBe(false); // día 89
    expect(planVencido(INICIO, '2026-11-16')).toBe(true); // día 90
    expect(planVencido(INICIO, '2026-08-18')).toBe(false);
  });
});

describe('Plan · aislamiento del asistente IA', () => {
  it('las cinco tablas nuevas están en TABLAS_SENSIBLES', () => {
    for (const t of ['planes', 'okrs', 'krs', 'acciones', 'checkins']) {
      expect(TABLAS_SENSIBLES).toContain(t);
    }
  });
});
