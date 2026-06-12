import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { crearReposCierres } from '../sqlite/cierresRepos';
import { crearRepositorios } from '../sqlite/repos';
import { crearEgresosAdminRepo } from '../sqlite/egresosRepos';
import { crearRepositoriosDashboard } from '../adapters/dashboardRepos';
import { sembrarBaseDemo } from '../seed/demo';
import { sembrarCierresDemo } from '../seed/cierresDemo';
import * as uc from '../../application/useCases';
import * as uce from '../../application/egresos/useCases';

async function setup() {
  const db = getDbMemoria();
  await sembrarBaseDemo(crearRepositorios(db));
  await sembrarCierresDemo(crearReposCierres(db));
  return db;
}
const hist = (db: ReturnType<typeof getDbMemoria>) => uc.obtenerHistorico(crearRepositoriosDashboard(db));

describe('Cash flow neto = entradas − egresos por mes', () => {
  it('neto operativo = cashCollected − egresos operativos (USD), por mes', async () => {
    const db = await setup();
    for (const p of await hist(db)) {
      expect(p.netoOperativo).toBeCloseTo(p.cashCollected - p.egresosOperativos, 2);
      expect(p.netoTotal).toBeCloseTo(p.cashCollected - p.egresosTotales, 2);
    }
  });

  it('egresos del histórico = fuente real de egresos del mes (operativo separa retiros)', async () => {
    const db = await setup();
    const egRepo = crearEgresosAdminRepo(db);
    const mayo = (await hist(db)).find((p) => p.mes === '2026-05')!;
    const resumen = await uce.resumenEgresos(egRepo, '2026-05');
    expect(mayo.egresosOperativos).toBeCloseTo(resumen.costoOperativoUsd, 2);
    expect(mayo.egresosTotales).toBeCloseTo(resumen.totalUsd, 2);
  });

  it('si hay retiros de socios, neto total < neto operativo ese mes', async () => {
    const db = await setup();
    const egRepo = crearEgresosAdminRepo(db);
    await uce.crearEgreso(egRepo, { fecha: '2026-05-25', categoria: 'Retiros de socios', concepto: 'distrib', montoUsd: 3000 });
    const mayo = (await hist(db)).find((p) => p.mes === '2026-05')!;
    expect(mayo.netoTotal).toBeCloseTo(mayo.netoOperativo - 3000, 2);
    expect(mayo.egresosOperativos).toBeLessThan(mayo.egresosTotales);
  });

  it('un recurrente se proyecta a los meses del histórico (misma fuente que Egresos)', async () => {
    const db = await setup();
    const egRepo = crearEgresosAdminRepo(db);
    await uce.crearEgreso(egRepo, { fecha: '2026-03-01', categoria: 'Gastos fijos', concepto: 'alquiler', montoUsd: 900, recurrente: true });
    const h = await hist(db);
    const abr = h.find((p) => p.mes === '2026-04')!;
    const may = h.find((p) => p.mes === '2026-05')!;
    // el alquiler recurrente aparece proyectado en abril y mayo
    expect(abr.egresosOperativos).toBeGreaterThanOrEqual(900);
    expect(may.egresosOperativos).toBeGreaterThanOrEqual(900);
  });
});
