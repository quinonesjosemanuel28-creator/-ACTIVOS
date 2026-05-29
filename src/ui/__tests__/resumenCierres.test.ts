import { describe, it, expect } from 'vitest';
import { resumenDesdeFilas } from '../lib/resumenCierres';
import type { FilaCierre } from '../lib/api';

const fila = (pagos: { montoUsd: number; montoArs?: number }[]): FilaCierre => ({
  cierre: {
    idCierre: 'c', fechaCierre: '2026-03-01', clienteNombre: 'x', programa: 'Empresario',
    ticketTotalUsd: 3000, unidadNegocio: 'ACADEMY', estado: 'Activo',
  },
  pagos: pagos.map((p, i) => ({
    idPago: `p${i}`, idCierre: 'c', fechaPago: '2026-03-02', montoUsd: p.montoUsd, montoArs: p.montoArs,
    tipoPago: 'Cuota', medioPago: 'Otro',
  })),
  pagadoUsd: 0, pagadoArs: 0, pendienteUsd: 0, estadoSaldo: 'parcial',
});

describe('resumenDesdeFilas (modo Todos los meses)', () => {
  it('suma USD y ARS de todos los pagos', () => {
    const r = resumenDesdeFilas([
      fila([{ montoUsd: 1000, montoArs: 1_180_000 }, { montoUsd: 500, montoArs: 650_000 }]),
      fila([{ montoUsd: 2000, montoArs: 2_600_000 }]),
    ]);
    expect(r.totalCobradoUsd).toBe(3500);
    expect(r.totalCobradoArs).toBe(4_430_000);
    expect(r.cantidadCierres).toBe(2);
    expect(r.cantidadPagos).toBe(3);
  });

  it('cotización ponderada = ARS/USD solo sobre pagos con ARS', () => {
    const r = resumenDesdeFilas([fila([{ montoUsd: 1000, montoArs: 1_300_000 }, { montoUsd: 999 }])]);
    expect(r.cotizacionPonderada).toBe(1300); // el pago sin ARS no distorsiona
  });

  it('sin pagos con ARS → cotización null (se muestra "—")', () => {
    const r = resumenDesdeFilas([fila([{ montoUsd: 1000 }])]);
    expect(r.cotizacionPonderada).toBeNull();
    expect(r.totalCobradoArs).toBe(0);
  });

  it('listado vacío → ceros y cotización null', () => {
    const r = resumenDesdeFilas([]);
    expect(r).toEqual({ totalCobradoUsd: 0, totalCobradoArs: 0, cotizacionPonderada: null, cantidadCierres: 0, cantidadPagos: 0 });
  });
});
