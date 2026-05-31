import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { crearReposCierres } from '../sqlite/cierresRepos';
import { crearRepositorios } from '../sqlite/repos';
import { crearRepositoriosDashboard } from '../adapters/dashboardRepos';
import { sembrarBaseDemo } from '../seed/demo';
import { sembrarCierresDemo } from '../seed/cierresDemo';
import * as ucc from '../../application/cierres/useCases';
import * as uc from '../../application/useCases';

function setup() {
  const db = getDbMemoria();
  sembrarBaseDemo(crearRepositorios(db));
  sembrarCierresDemo(crearReposCierres(db));
  return db;
}

describe('Resumen Cierres · desglose cash + cierres por programa', () => {
  it('cashNuevo + cohortes = total cobrado (USD y ARS)', () => {
    const db = setup();
    const r = ucc.resumenDelMes(crearReposCierres(db), '2026-05');
    expect(r.cashNuevoUsd + r.cohortesUsd).toBeCloseTo(r.totalCobradoUsd, 2);
    expect(r.cashNuevoArs + r.cohortesArs).toBeCloseTo(r.totalCobradoArs, 2);
  });

  it('cashNuevo/cohortes USD COINCIDEN con la Vista Ejecutiva (misma definición)', () => {
    const db = setup();
    const resumen = ucc.resumenDelMes(crearReposCierres(db), '2026-05');
    const snap = uc.obtenerDashboardDelMes(crearRepositoriosDashboard(db), '2026-05').snapshot;
    expect(resumen.cashNuevoUsd).toBeCloseTo(snap.cashNuevo, 2);
    expect(resumen.cohortesUsd).toBeCloseTo(snap.cohortes, 2);
  });

  it('cierres por programa suman la cantidad de cierres del mes', () => {
    const db = setup();
    const r = ucc.resumenDelMes(crearReposCierres(db), '2026-05');
    const cierresMayo = ucc.listarCierresConPagos(crearReposCierres(db), { mes: '2026-05' }).length;
    expect(r.cierresPorPrograma.empresario + r.cierresPorPrograma.ceroGestor).toBe(cierresMayo);
  });

  it('respeta el filtro de programa', () => {
    const db = setup();
    const soloEmp = ucc.resumenDelMes(crearReposCierres(db), '2026-05', { programa: 'Empresario' });
    expect(soloEmp.cierresPorPrograma.ceroGestor).toBe(0);
    expect(soloEmp.cierresPorPrograma.empresario).toBeGreaterThan(0);
  });
});
