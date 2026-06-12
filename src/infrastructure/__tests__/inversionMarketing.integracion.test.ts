import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { crearEgresosAdminRepo } from '../sqlite/egresosRepos';
import { crearRepositoriosDashboard } from '../adapters/dashboardRepos';
import { crearReposCierres } from '../sqlite/cierresRepos';
import * as uc from '../../application/useCases';
import * as uce from '../../application/egresos/useCases';

/**
 * Regresión: "Inversión Marketing" del dashboard ejecutivo debe leer los
 * egresos de categoría "Marketing y publicidad" (la fuente nueva), no $0.
 */
async function setup() {
  const db = getDbMemoria();
  const egRepo = crearEgresosAdminRepo(db);
  // Un cierre con un cobro en mayo, para que CAC/ROAS/MER sean calculables.
  const cierres = crearReposCierres(db);
  await cierres.cierres.guardar({ idCierre: 'C1', fechaCierre: '2026-05-02', clienteNombre: 'X', programa: 'Empresario', ticketTotalUsd: 3000, closer: 'Ana', unidadNegocio: 'ACADEMY', estado: 'Activo' });
  await cierres.pagos.guardar({ idPago: 'P1', idCierre: 'C1', fechaPago: '2026-05-03', montoUsd: 3000, tipoPago: 'Pago Completo', medioPago: 'Otro' });
  // Egresos de mayo: dos de marketing (suman 3500) + uno de otra categoría.
  await uce.crearEgreso(egRepo, { fecha: '2026-05-04', categoria: 'Marketing y publicidad', concepto: 'IG', montoUsd: 2000 });
  await uce.crearEgreso(egRepo, { fecha: '2026-05-10', categoria: 'Marketing y publicidad', concepto: 'Google', montoUsd: 1500 });
  await uce.crearEgreso(egRepo, { fecha: '2026-05-06', categoria: 'Sueldos', concepto: 'equipo', montoUsd: 4000 });
  return { db, egRepo };
}

describe('Inversión Marketing del dashboard ↔ egresos de marketing', () => {
  it('inversionMarketing = suma de egresos categoría marketing del mes (3500)', async () => {
    const { db, egRepo } = await setup();
    const snap = (await uc.obtenerDashboardDelMes(crearRepositoriosDashboard(db), '2026-05')).snapshot;

    const marketingEgresos = (await uce.listarEgresos(egRepo, { mes: '2026-05' }))
      .filter((e) => e.categoria === 'Marketing y publicidad')
      .reduce((a, e) => a + e.montoUsd, 0);

    expect(marketingEgresos).toBe(3500);
    expect(snap.inversionMarketing).toBe(3500); // antes daba 0
  });

  it('CAC/ROAS/MER se vuelven calculables al conectar la fuente', async () => {
    const { db } = await setup();
    const snap = (await uc.obtenerDashboardDelMes(crearRepositoriosDashboard(db), '2026-05')).snapshot;
    expect(snap.cac).toBeCloseTo(3500 / 1); // 1 cierre en mayo
    expect(snap.roas).toBeCloseTo(3000 / 3500); // cash / inversión
    expect(snap.mer).toBeCloseTo(3000 / 3500); // ventas nuevas / inversión
  });

  it('utilidad y egresos totales siguen leyendo toda la fuente (no se rompen)', async () => {
    const { db } = await setup();
    const snap = (await uc.obtenerDashboardDelMes(crearRepositoriosDashboard(db), '2026-05')).snapshot;
    expect(snap.egresosTotales).toBe(7500); // 2000+1500+4000
    expect(snap.utilidadOperativa.valor).toBe(3000 - 7500);
  });
});
