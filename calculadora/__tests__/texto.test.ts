import { describe, expect, it } from 'vitest';
import { parsearNumero } from '../texto';

describe('parsearNumero · lo que tipea un closer en vivo', () => {
  it('lee números enteros pelados', () => {
    expect(parsearNumero('15000000')).toBe(15_000_000);
    expect(parsearNumero('0')).toBe(0);
  });

  it('entiende el punto como separador de miles (convención argentina)', () => {
    expect(parsearNumero('1.500')).toBe(1500);
    expect(parsearNumero('15.000.000')).toBe(15_000_000);
  });

  it('entiende la coma como decimal', () => {
    expect(parsearNumero('12,5')).toBe(12.5);
    expect(parsearNumero('0,75')).toBe(0.75);
    expect(parsearNumero('1.250,50')).toBe(1250.5);
  });

  it('acepta el punto decimal cuando no puede ser miles', () => {
    expect(parsearNumero('12.5')).toBe(12.5);
    expect(parsearNumero('0.5')).toBe(0.5);
    expect(parsearNumero('8.25')).toBe(8.25);
  });

  it('ignora símbolos, espacios y texto pegado', () => {
    expect(parsearNumero('$ 15.000.000')).toBe(15_000_000);
    expect(parsearNumero('8 %')).toBe(8);
    expect(parsearNumero('  3 meses ')).toBe(3);
    expect(parsearNumero('US$ 1.200,40')).toBe(1200.4);
  });

  it('respeta el signo negativo', () => {
    expect(parsearNumero('-2.500')).toBe(-2500);
    expect(parsearNumero('-12,5')).toBe(-12.5);
  });

  it('devuelve NaN cuando no hay ningún número', () => {
    expect(parsearNumero('')).toBeNaN();
    expect(parsearNumero('   ')).toBeNaN();
    expect(parsearNumero('-')).toBeNaN();
    expect(parsearNumero('no sé')).toBeNaN();
    expect(parsearNumero('$')).toBeNaN();
  });

  it('nunca devuelve Infinity', () => {
    for (const entrada of ['1e999', '.', ',', '...', '1.2.3', '1,2,3']) {
      const r = parsearNumero(entrada);
      expect(Number.isFinite(r) || Number.isNaN(r)).toBe(true);
    }
  });
});
