/**
 * REGLA CRÍTICA (tests dedicados):
 * Una cuota PENDIENTE no es cash real. NO entra a cash collected, cohortes,
 * comisiones ni utilidad hasta que se cobra.
 *
 * El diseño lo garantiza estructuralmente: esas métricas leen de `pagos`
 * (cobros reales), nunca del plan de cuotas. Acá lo verificamos comparando
 * el ANTES (venta nueva con plan, sin cobrar la cuota) vs el DESPUÉS de
 * registrar el pago real de esa cuota.
 */
import { describe, it, expect } from 'vitest';
import { cashCollectedUsd, cohortesUsd } from '../../cierres/metrics';
import { comisionesDelMes } from '../../comisiones/calculo';
import { cobranzaDeCierre } from '../calculo';
import { cierre as mkCierre, pago as mkPago } from '../../cierres/__tests__/fixtures';

const ventaNueva = mkCierre({
  idCierre: 'NV', fechaCierre: '2026-05-02', ticketTotalUsd: 4000,
  cantidadCuotas: 4, montoCuotaUsd: 1000, closer: 'Ana',
});
// Solo se cobró la cuota 1 (seña). Cuotas 2–4 PENDIENTES.
const pagosReales = [mkPago({ idPago: 'p1', idCierre: 'NV', fechaPago: '2026-05-02', montoUsd: 1000, montoArs: 1_300_000, closer: 'Ana' })];

describe('REGLA CRÍTICA · cuota pendiente NO es cash', () => {
  it('cash collected solo cuenta lo cobrado (1000), no el ticket comprometido (4000)', () => {
    expect(cashCollectedUsd(pagosReales, '2026-05')).toBe(1000);
    expect(cashCollectedUsd(pagosReales, '2026-05')).not.toBe(4000);
  });

  it('cohortes no incluye cuotas pendientes (no hay pago → no hay cohorte)', () => {
    // Mayo: el único pago es del mismo mes del cierre → cash nuevo, cohortes 0.
    expect(cohortesUsd([ventaNueva], pagosReales, '2026-05')).toBe(0);
  });

  it('comisiones se calculan sobre el ARS cobrado, no sobre cuotas pendientes', () => {
    const com = comisionesDelMes([ventaNueva], pagosReales, '2026-05');
    // 10% de 1_300_000 (lo cobrado) = 130.000; NO 10% de 4 cuotas.
    expect(com.totalArs).toBe(130_000);
  });

  it('la cobranza ve el saldo pendiente (3000) pero ESO no es cash', () => {
    const cb = cobranzaDeCierre(ventaNueva, pagosReales, '2026-05-10');
    expect(cb.saldoPendienteUsd).toBe(3000); // proyección/control
    expect(cashCollectedUsd(pagosReales, '2026-05')).toBe(1000); // cash real, sin tocar
  });

  it('al COBRAR la cuota 2, recién ahí entra a cash y comisiones', () => {
    const conCuota2 = [
      ...pagosReales,
      mkPago({ idPago: 'p2', idCierre: 'NV', fechaPago: '2026-06-01', montoUsd: 1000, montoArs: 1_400_000, closer: 'Ana' }),
    ];
    expect(cashCollectedUsd(conCuota2, '2026-06')).toBe(1000); // la cuota 2 cobrada en junio
    expect(cashCollectedUsd(conCuota2, '2026-05')).toBe(1000); // la seña en mayo
    // junio: la cuota 2 es cohorte (cierre de mayo) y comisiona al cobrarse
    expect(comisionesDelMes([ventaNueva], conCuota2, '2026-06').totalArs).toBe(140_000);
  });
});
