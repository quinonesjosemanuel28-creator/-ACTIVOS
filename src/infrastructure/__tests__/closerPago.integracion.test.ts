import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { crearReposCierres } from '../sqlite/cierresRepos';
import { crearRepositoriosDashboard } from '../adapters/dashboardRepos';
import { crearRepositorios } from '../sqlite/repos';
import { sembrarBaseDemo } from '../seed/demo';
import * as ucc from '../../application/cierres/useCases';
import * as uc from '../../application/useCases';

/**
 * Regresión del caso Cristhian Marín (C0113):
 *  - seña US$100 en marzo cobrada por JULIAN,
 *  - cuota US$900 el 2026-05-04 cobrada por AYRTON.
 * El closer va a nivel de PAGO. Mayo: Julian NO debe sumar los 900; Ayrton SÍ.
 * El total del mes sin filtrar no cambia.
 */
function setup() {
  const db = getDbMemoria();
  sembrarBaseDemo(crearRepositorios(db));
  const repos = crearReposCierres(db);
  ucc.crearCierre(repos, {
    idCierre: 'C0113', fechaCierre: '2026-03-31', clienteNombre: 'Cristhian Marín',
    programa: 'Empresario', ticketTotalUsd: 1000, closer: 'Julian',
  });
  ucc.agregarPago(repos, { idCierre: 'C0113', fechaPago: '2026-03-31', montoUsd: 100, tipoPago: 'Reserva/Seña', medioPago: 'Transferencia Lemon' }); // hereda Julian
  ucc.agregarPago(repos, { idCierre: 'C0113', fechaPago: '2026-05-04', montoUsd: 900, tipoPago: 'Cuota', medioPago: 'Transferencia BBVA', closer: 'Ayrton' });
  return { db, repos };
}

describe('Regresión Cristhian: closer a nivel de pago', () => {
  it('resumen mayo filtrando JULIAN excluye los 900', () => {
    const { repos } = setup();
    const r = ucc.resumenDelMes(repos, '2026-05', { closer: 'Julian' });
    expect(r.totalCobradoUsd).toBe(0); // Julian no cobró nada en mayo
  });

  it('resumen mayo filtrando AYRTON incluye los 900', () => {
    const { repos } = setup();
    const r = ucc.resumenDelMes(repos, '2026-05', { closer: 'Ayrton' });
    expect(r.totalCobradoUsd).toBe(900);
    expect(r.cantidadPagos).toBe(1);
    expect(r.cantidadCierres).toBe(1);
  });

  it('el total de mayo SIN filtrar no cambia (incluye los 900 una sola vez)', () => {
    const { repos } = setup();
    const sinFiltro = ucc.resumenDelMes(repos, '2026-05');
    // Sólo el pago de C0113 cae en mayo dentro de este setup (base demo no siembra cierres).
    expect(sinFiltro.totalCobradoUsd).toBe(900);
  });

  it('el listado filtrando JULIAN muestra C0113 (cobró la seña)', () => {
    const { repos } = setup();
    const filas = ucc.listarCierresConPagos(repos, { closer: 'Julian' });
    expect(filas.some((f) => f.cierre.idCierre === 'C0113')).toBe(true);
  });

  it('el listado filtrando AYRTON también muestra C0113 (cobró la cuota)', () => {
    const { repos } = setup();
    const filas = ucc.listarCierresConPagos(repos, { closer: 'Ayrton' });
    expect(filas.some((f) => f.cierre.idCierre === 'C0113')).toBe(true);
  });

  it('el dashboard total de mayo no se ve afectado por el split de closer', () => {
    const { db } = setup();
    const snap = uc.obtenerDashboardDelMes(crearRepositoriosDashboard(db), '2026-05').snapshot;
    expect(snap.cashCollected.valor).toBe(900);
  });
});
