import { describe, it, expect } from 'vitest';
import { derivarMonedas } from '../lib/cotizacion';

describe('derivarMonedas (cálculo en vivo de cotización)', () => {
  it('ARS + USD → deriva cotización', () => {
    expect(derivarMonedas({ montoUsd: 1000, montoArs: 1_180_000 }).cotizacion).toBeCloseTo(1180);
  });
  it('USD + cotización → deriva ARS', () => {
    expect(derivarMonedas({ montoUsd: 1000, cotizacion: 1200 }).montoArs).toBe(1_200_000);
  });
  it('ARS + cotización → deriva USD', () => {
    expect(derivarMonedas({ montoArs: 1_200_000, cotizacion: 1200 }).montoUsd).toBe(1000);
  });
  it('ARS + USD mandan: ignora la cotización inconsistente', () => {
    expect(derivarMonedas({ montoUsd: 1000, montoArs: 1_180_000, cotizacion: 900 }).cotizacion).toBeCloseTo(1180);
  });
  it('solo USD → cotización indefinida (se muestra "—")', () => {
    expect(derivarMonedas({ montoUsd: 1000 }).cotizacion).toBeUndefined();
  });
  it('datos vacíos → todo indefinido, sin NaN', () => {
    const r = derivarMonedas({});
    expect(r.cotizacion).toBeUndefined();
    expect(r.montoUsd).toBeUndefined();
  });
  it('cero no genera división por cero', () => {
    expect(derivarMonedas({ montoUsd: 0, montoArs: 1000 }).cotizacion).toBeUndefined();
  });
});
