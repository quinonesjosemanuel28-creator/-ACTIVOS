import { describe, it, expect } from 'vitest';
import { nivelPorAtraso, nivelCuota, peorNivel, diasEntre } from '../semaforo';

describe('Semáforo · nivelPorAtraso (bordes exactos)', () => {
  it('sin alerta a más de 5 días de vencer (faltan 6 → atraso −6)', () => {
    expect(nivelPorAtraso(-6)).toBeNull();
  });
  it('verde: faltan 5 días (atraso −5) … 1 día (−1)', () => {
    expect(nivelPorAtraso(-5)).toBe('verde');
    expect(nivelPorAtraso(-1)).toBe('verde');
  });
  it('amarillo: día 0 (vence hoy) al día 3', () => {
    expect(nivelPorAtraso(0)).toBe('amarillo'); // día 0 ya cuenta como vencido
    expect(nivelPorAtraso(3)).toBe('amarillo');
  });
  it('borde día 3→4: amarillo → naranja', () => {
    expect(nivelPorAtraso(3)).toBe('amarillo');
    expect(nivelPorAtraso(4)).toBe('naranja');
  });
  it('naranja: día 4 al día 8', () => {
    expect(nivelPorAtraso(4)).toBe('naranja');
    expect(nivelPorAtraso(8)).toBe('naranja');
  });
  it('borde día 8→9: naranja → rojo', () => {
    expect(nivelPorAtraso(8)).toBe('naranja');
    expect(nivelPorAtraso(9)).toBe('rojo');
  });
  it('rojo: día 9 al día 60', () => {
    expect(nivelPorAtraso(9)).toBe('rojo');
    expect(nivelPorAtraso(60)).toBe('rojo');
  });
  it('borde día 60→61: rojo → negro (lista negra)', () => {
    expect(nivelPorAtraso(60)).toBe('rojo');
    expect(nivelPorAtraso(61)).toBe('negro');
  });
  it('negro: día 61 en adelante', () => {
    expect(nivelPorAtraso(61)).toBe('negro');
    expect(nivelPorAtraso(365)).toBe('negro');
  });
});

describe('Semáforo · nivelCuota', () => {
  it('cuota completa no tiene alerta', () => {
    expect(nivelCuota('2026-01-01', true, '2026-12-31')).toBeNull();
  });
  it('día 5 antes de vencer = verde; día 6 antes = sin alerta', () => {
    // vence 2026-06-10; hoy 2026-06-05 → faltan 5 → verde
    expect(nivelCuota('2026-06-10', false, '2026-06-05')).toBe('verde');
    // hoy 2026-06-04 → faltan 6 → sin alerta
    expect(nivelCuota('2026-06-10', false, '2026-06-04')).toBeNull();
  });
  it('día exacto del vencimiento = amarillo (día 0)', () => {
    expect(nivelCuota('2026-06-10', false, '2026-06-10')).toBe('amarillo');
  });
});

describe('Semáforo · peorNivel (color del cierre)', () => {
  it('toma el más severo', () => {
    expect(peorNivel(['verde', 'rojo', 'amarillo'])).toBe('rojo');
    expect(peorNivel(['amarillo', 'naranja'])).toBe('naranja');
    expect(peorNivel(['verde', null])).toBe('verde');
  });
  it('negro es el peor de todos', () => {
    expect(peorNivel(['rojo', 'negro', 'amarillo'])).toBe('negro');
    expect(peorNivel(['verde', 'negro'])).toBe('negro');
  });
  it('null si ninguna tiene alerta', () => {
    expect(peorNivel([null, null])).toBeNull();
    expect(peorNivel([])).toBeNull();
  });
});

describe('Semáforo · diasEntre', () => {
  it('cuenta días enteros UTC', () => {
    expect(diasEntre('2026-06-01', '2026-06-10')).toBe(9);
    expect(diasEntre('2026-06-10', '2026-06-01')).toBe(-9);
  });
});
