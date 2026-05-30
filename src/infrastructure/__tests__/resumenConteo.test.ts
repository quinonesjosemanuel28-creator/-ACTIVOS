import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { crearReposCierres } from '../sqlite/cierresRepos';
import * as ucc from '../../application/cierres/useCases';

/**
 * Regresión "Pagos / Cierres": el conteo de CIERRES cuenta id_cierre únicos,
 * no pagos. Un cierre con varias cuotas el mismo mes = 1 cierre / N pagos.
 * Los cobros de cohorte suman a pagos pero no a cierres nuevos del mes.
 */
function setup() {
  return crearReposCierres(getDbMemoria());
}

describe('resumenDelMes · conteo Pagos vs Cierres', () => {
  it('un cierre con 3 pagos el mismo mes = 1 cierre / 3 pagos', () => {
    const repos = setup();
    ucc.crearCierre(repos, { idCierre: 'C1', fechaCierre: '2026-05-02', clienteNombre: 'A', programa: 'Empresario', ticketTotalUsd: 3000, closer: 'Ana' });
    ucc.agregarPago(repos, { idCierre: 'C1', fechaPago: '2026-05-03', montoUsd: 1000, tipoPago: 'Reserva/Seña', medioPago: 'Otro' });
    ucc.agregarPago(repos, { idCierre: 'C1', fechaPago: '2026-05-12', montoUsd: 1000, tipoPago: 'Cuota', medioPago: 'Otro' });
    ucc.agregarPago(repos, { idCierre: 'C1', fechaPago: '2026-05-20', montoUsd: 1000, tipoPago: 'Cuota', medioPago: 'Otro' });
    const r = ucc.resumenDelMes(repos, '2026-05');
    expect(r.cantidadPagos).toBe(3);
    expect(r.cantidadCierres).toBe(1);
  });

  it('tres cierres con un pago cada uno = 3 cierres / 3 pagos', () => {
    const repos = setup();
    for (const id of ['A', 'B', 'C']) {
      ucc.crearCierre(repos, { idCierre: id, fechaCierre: '2026-05-05', clienteNombre: id, programa: 'Cero a Gestor', ticketTotalUsd: 1200, closer: 'Bruno' });
      ucc.agregarPago(repos, { idCierre: id, fechaPago: '2026-05-06', montoUsd: 600, tipoPago: 'Pago Completo', medioPago: 'Otro' });
    }
    const r = ucc.resumenDelMes(repos, '2026-05');
    expect(r.cantidadPagos).toBe(3);
    expect(r.cantidadCierres).toBe(3);
  });

  it('cohorte: el pago suma a pagos pero el cierre de un mes previo no cuenta como cierre del mes', () => {
    const repos = setup();
    // Cierre de mayo con su seña en mayo
    ucc.crearCierre(repos, { idCierre: 'MAY', fechaCierre: '2026-05-04', clienteNombre: 'M', programa: 'Empresario', ticketTotalUsd: 2000, closer: 'Ana' });
    ucc.agregarPago(repos, { idCierre: 'MAY', fechaPago: '2026-05-04', montoUsd: 1000, tipoPago: 'Reserva/Seña', medioPago: 'Otro' });
    // Cierre de abril con una cuota que cae en mayo (cohorte)
    ucc.crearCierre(repos, { idCierre: 'ABR', fechaCierre: '2026-04-10', clienteNombre: 'B', programa: 'Empresario', ticketTotalUsd: 2000, closer: 'Ana' });
    ucc.agregarPago(repos, { idCierre: 'ABR', fechaPago: '2026-05-15', montoUsd: 1000, tipoPago: 'Cuota', medioPago: 'Otro' });

    const r = ucc.resumenDelMes(repos, '2026-05');
    expect(r.cantidadPagos).toBe(2); // ambos pagos caen en mayo
    expect(r.cantidadCierres).toBe(1); // solo MAY es cierre nuevo de mayo (M < N)
  });
});
