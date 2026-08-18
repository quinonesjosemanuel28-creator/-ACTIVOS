import { describe, it, expect } from 'vitest';
import {
  estadoAcciones,
  estadoTokenSeguimiento,
  faseActual,
  planVencido,
  ultimaActividadAlumno,
  type Checkin,
  type TokenSeguimiento,
} from '../plan';
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
  it('las tablas del plan y el token de seguimiento están en TABLAS_SENSIBLES', () => {
    for (const t of ['planes', 'okrs', 'krs', 'acciones', 'checkins', 'seguimiento_tokens']) {
      expect(TABLAS_SENSIBLES).toContain(t);
    }
  });
});

describe('Plan · estado del checklist (append-only, gana el último)', () => {
  const c = (accionId: string, marcado: boolean, creadoEn: string, origen: 'alumno' | 'consultor' = 'alumno'): Checkin => ({
    id: `${accionId}-${creadoEn}`, accionId, marcado, origen, creadoEn,
    // Ticket 9: fixture como fila LEGADA (sin estado) — estadoDe cae al booleano.
    estado: null, nota: null, usuarioId: null,
  });

  it('el checkin más nuevo de cada acción define su estado', () => {
    const estado = estadoAcciones([
      c('a1', true, '2026-08-20'),
      c('a1', false, '2026-08-25'), // se desmarcó después
      c('a2', true, '2026-08-22'),
    ]);
    expect(estado.get('a1')!.marcado).toBe(false);
    expect(estado.get('a2')!.marcado).toBe(true);
    expect(estado.has('a3')).toBe(false); // sin checkins = sin estado (no hecha)
  });

  it('el orden de llegada no importa: manda creadoEn', () => {
    const estado = estadoAcciones([c('a1', false, '2026-08-25'), c('a1', true, '2026-08-20')]);
    expect(estado.get('a1')!.marcado).toBe(false);
  });

  it('la última actividad es del ALUMNO: los checkins del consultor no cuentan', () => {
    expect(ultimaActividadAlumno([
      c('a1', true, '2026-08-20', 'alumno'),
      c('a2', true, '2026-08-28', 'consultor'),
    ])).toBe('2026-08-20');
    expect(ultimaActividadAlumno([c('a1', true, '2026-08-28', 'consultor')])).toBeNull();
    expect(ultimaActividadAlumno([])).toBeNull();
  });
});

describe('Plan · token de seguimiento', () => {
  const t = (over: Partial<TokenSeguimiento> = {}): TokenSeguimiento => ({
    token: 'tok', planId: 'p1', expiraEn: '2026-12-16T00:00:00.000Z', revocadoEn: null, creadoEn: '2026-08-18', ...over,
  });

  it('vivo, vencido, revocado e inexistente', () => {
    const AHORA = '2026-09-01T00:00:00.000Z';
    expect(estadoTokenSeguimiento(t(), AHORA)).toEqual({ valido: true });
    expect(estadoTokenSeguimiento(null, AHORA)).toEqual({ valido: false, motivo: 'inexistente' });
    expect(estadoTokenSeguimiento(t({ expiraEn: '2026-08-30T00:00:00.000Z' }), AHORA)).toEqual({ valido: false, motivo: 'vencido' });
    expect(estadoTokenSeguimiento(t({ revocadoEn: '2026-08-25' }), AHORA)).toEqual({ valido: false, motivo: 'revocado' });
  });

  it('revocado gana sobre vencido (el mensaje al alumno es distinto)', () => {
    const viejo = t({ revocadoEn: '2026-08-25', expiraEn: '2026-08-01T00:00:00.000Z' });
    expect(estadoTokenSeguimiento(viejo, '2026-09-01T00:00:00.000Z')).toEqual({ valido: false, motivo: 'revocado' });
  });
});
