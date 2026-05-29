import { describe, it, expect } from 'vitest';
import * as m from '../metrics';
import { cierre, pago } from './fixtures';

describe('Cash Collected doble moneda (mes)', () => {
  const pagos = [
    pago({ idPago: 'a', fechaPago: '2026-03-04', montoUsd: 1000, montoArs: 1_200_000 }), // cotiz 1200
    pago({ idPago: 'b', fechaPago: '2026-03-20', montoUsd: 500, montoArs: 650_000 }), // cotiz 1300
    pago({ idPago: 'c', fechaPago: '2026-04-02', montoUsd: 800, montoArs: 1_040_000 }), // otro mes
  ];

  it('USD del mes', () => {
    expect(m.cashCollectedUsd(pagos, '2026-03')).toBe(1500);
  });
  it('ARS del mes (dinero real cobrado)', () => {
    expect(m.cashCollectedArs(pagos, '2026-03')).toBe(1_850_000);
  });
  it('cotización ponderada del mes = Σars/Σusd', () => {
    expect(m.cotizacionPonderadaMes(pagos, '2026-03')).toBeCloseTo(1_850_000 / 1500); // 1233.33
  });
  it('cotización null si no hay ARS cargado', () => {
    expect(m.cotizacionPonderadaMes([pago({ fechaPago: '2026-03-10', montoArs: undefined })], '2026-03')).toBeNull();
  });
  it('pagos sin ARS no distorsionan la cotización ponderada', () => {
    const mix = [
      pago({ idPago: 'x', fechaPago: '2026-03-01', montoUsd: 100, montoArs: 130_000 }), // 1300
      pago({ idPago: 'y', fechaPago: '2026-03-02', montoUsd: 999, montoArs: undefined }), // migrado sin ARS
    ];
    expect(m.cotizacionPonderadaMes(mix, '2026-03')).toBe(1300);
  });
});

describe('Cash Nuevo vs Cohortes (doble moneda)', () => {
  const cierres = [
    cierre({ idCierre: 'C-mar', fechaCierre: '2026-03-02' }),
    cierre({ idCierre: 'C-ene', fechaCierre: '2026-01-15' }),
  ];
  const pagos = [
    pago({ idPago: 'p1', idCierre: 'C-mar', fechaPago: '2026-03-10', montoUsd: 1000, montoArs: 1_300_000 }), // nuevo
    pago({ idPago: 'p2', idCierre: 'C-ene', fechaPago: '2026-03-12', montoUsd: 600, montoArs: 780_000 }), // cohorte
  ];

  it('cash nuevo USD = pagos del mes de cierres del mismo mes', () => {
    expect(m.cashNuevoUsd(cierres, pagos, '2026-03')).toBe(1000);
  });
  it('cohortes USD = pagos del mes de cierres anteriores', () => {
    expect(m.cohortesUsd(cierres, pagos, '2026-03')).toBe(600);
  });
  it('cash nuevo ARS', () => {
    expect(m.cashNuevoArs(cierres, pagos, '2026-03')).toBe(1_300_000);
  });
  it('cohortes ARS', () => {
    expect(m.cohortesArs(cierres, pagos, '2026-03')).toBe(780_000);
  });
  it('nuevo + cohortes = cash collected (ambas monedas)', () => {
    expect(m.cashNuevoUsd(cierres, pagos, '2026-03') + m.cohortesUsd(cierres, pagos, '2026-03')).toBe(
      m.cashCollectedUsd(pagos, '2026-03'),
    );
    expect(m.cashNuevoArs(cierres, pagos, '2026-03') + m.cohortesArs(cierres, pagos, '2026-03')).toBe(
      m.cashCollectedArs(pagos, '2026-03'),
    );
  });
});

describe('Totales y estado de saldo por cierre', () => {
  const c = cierre({ idCierre: 'CL', ticketTotalUsd: 3000 });
  const pagos = [
    pago({ idPago: '1', idCierre: 'CL', montoUsd: 1000, montoArs: 1_300_000, tipoPago: 'Reserva/Seña' }),
    pago({ idPago: '2', idCierre: 'CL', montoUsd: 800, montoArs: 1_040_000, tipoPago: 'Cuota' }),
  ];

  it('total pagado USD y ARS', () => {
    expect(m.totalPagadoUsd('CL', pagos)).toBe(1800);
    expect(m.totalPagadoArs('CL', pagos)).toBe(2_340_000);
  });
  it('pendiente USD = ticket − pagado', () => {
    expect(m.pendienteUsd(c, pagos)).toBe(1200);
  });
  it('estado parcial cuando hay cuota además de seña', () => {
    expect(m.estadoSaldo(c, pagos)).toBe('parcial');
  });
  it('estado solo-seña', () => {
    expect(m.estadoSaldo(c, [pago({ idCierre: 'CL', montoUsd: 500, tipoPago: 'Reserva/Seña' })])).toBe('solo-seña');
  });
  it('estado saldado', () => {
    const full = [pago({ idCierre: 'CL', montoUsd: 3000, tipoPago: 'Pago Completo' })];
    expect(m.estadoSaldo(c, full)).toBe('saldado');
  });
  it('estado sin-pagos', () => {
    expect(m.estadoSaldo(c, [])).toBe('sin-pagos');
  });
});

describe('Ventas Nuevas y cierres del mes', () => {
  const cierres = [
    cierre({ idCierre: 'a', fechaCierre: '2026-03-01', ticketTotalUsd: 3000 }),
    cierre({ idCierre: 'b', fechaCierre: '2026-03-20', ticketTotalUsd: 1200 }),
    cierre({ idCierre: 'c', fechaCierre: '2026-02-10', ticketTotalUsd: 5000 }),
  ];
  it('Ventas Nuevas USD del mes', () => {
    expect(m.ventasNuevasUsd(cierres, '2026-03')).toBe(4200);
  });
  it('cierres nuevos del mes', () => {
    expect(m.cierresNuevos(cierres, '2026-03')).toBe(2);
  });
});

describe('Acumulado ARS por closer/setter (base comisiones futura)', () => {
  const cierres = [
    cierre({ idCierre: 'a', closer: 'Ana', setter: 'Diego' }),
    cierre({ idCierre: 'b', closer: 'Bruno', setter: 'Diego' }),
  ];
  const pagos = [
    pago({ idCierre: 'a', fechaPago: '2026-03-05', montoArs: 1_000_000 }),
    pago({ idCierre: 'a', fechaPago: '2026-03-15', montoArs: 500_000 }),
    pago({ idCierre: 'b', fechaPago: '2026-03-10', montoArs: 800_000 }),
    pago({ idCierre: 'b', fechaPago: '2026-04-10', montoArs: 999_999 }), // otro mes
  ];

  it('agrupa ARS cobrado por closer en el mes', () => {
    expect(m.acumuladoArsPorCloser(cierres, pagos, '2026-03')).toEqual({ Ana: 1_500_000, Bruno: 800_000 });
  });
  it('agrupa ARS cobrado por setter en el mes', () => {
    expect(m.acumuladoArsPorSetter(cierres, pagos, '2026-03')).toEqual({ Diego: 2_300_000 });
  });
});
