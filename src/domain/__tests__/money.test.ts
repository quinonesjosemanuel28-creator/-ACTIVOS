import { describe, it, expect } from 'vitest';
import { safeDiv, sumBy, round2, variacionMM } from '../money';

describe('money · división segura (cero #REF!)', () => {
  it('divide normalmente', () => {
    expect(safeDiv(10, 4)).toBe(2.5);
  });

  it('devuelve null al dividir por cero (no NaN, no crash)', () => {
    expect(safeDiv(100, 0)).toBeNull();
  });

  it('devuelve null ante operandos no finitos', () => {
    expect(safeDiv(NaN, 1)).toBeNull();
    expect(safeDiv(1, Infinity)).toBeNull();
  });
});

describe('money · sumBy', () => {
  it('suma un campo e ignora valores no finitos', () => {
    expect(sumBy([{ x: 1 }, { x: 2 }, { x: NaN }], (i) => i.x)).toBe(3);
  });
  it('suma vacío = 0', () => {
    expect(sumBy([], (i: { x: number }) => i.x)).toBe(0);
  });
});

describe('money · round2 y variacionMM', () => {
  it('redondea a 2 decimales sin error de coma flotante', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
  it('variación M/M positiva', () => {
    expect(variacionMM(120, 100)).toBeCloseTo(0.2);
  });
  it('variación M/M con base 0 = null', () => {
    expect(variacionMM(50, 0)).toBeNull();
  });
});
