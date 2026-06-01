import { describe, it, expect } from 'vitest';
import { acumuladoArsPorCloser, cashUsdPorCloser, closerEfectivo } from '../metrics';
import { cierre, pago } from './fixtures';

describe('closerEfectivo (crédito por quien cobra)', () => {
  const c = cierre({ idCierre: 'C', closer: 'Julian' });
  it('usa el closer del pago si lo tiene', () => {
    expect(closerEfectivo(pago({ idCierre: 'C', closer: 'Ayrton' }), c)).toBe('Ayrton');
  });
  it('hereda el closer del cierre si el pago no tiene', () => {
    expect(closerEfectivo(pago({ idCierre: 'C', closer: undefined }), c)).toBe('Julian');
  });
});

describe('Atribución por closer DEL PAGO (cierre con dos closers)', () => {
  // Cierre cerrado por Julian; seña la cobra Julian, cuota de mayo la cobra Ayrton.
  const cierres = [cierre({ idCierre: 'CMIX', closer: 'Julian', fechaCierre: '2026-03-31' })];
  const pagos = [
    pago({ idPago: 'p0', idCierre: 'CMIX', fechaPago: '2026-03-31', montoUsd: 100, montoArs: 118_000, closer: undefined }), // hereda Julian
    pago({ idPago: 'p1', idCierre: 'CMIX', fechaPago: '2026-05-04', montoUsd: 900, montoArs: 1_170_000, closer: 'Ayrton' }),
  ];

  it('mayo: el USD se acredita a Ayrton, no a Julian', () => {
    const porCloser = cashUsdPorCloser(cierres, pagos, '2026-05');
    expect(porCloser['Ayrton']).toBe(900);
    expect(porCloser['Julian']).toBeUndefined();
  });
  it('marzo: la seña se acredita a Julian (heredada)', () => {
    expect(cashUsdPorCloser(cierres, pagos, '2026-03')).toEqual({ Julian: 100 });
  });
  it('ARS por closer del pago en mayo va a Ayrton', () => {
    expect(acumuladoArsPorCloser(cierres, pagos, '2026-05')).toEqual({ Ayrton: 1_170_000 });
  });
});
