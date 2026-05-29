import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { crearReposCierres } from '../sqlite/cierresRepos';
import { crearRepositoriosDashboard } from '../adapters/dashboardRepos';
import { sembrarCierresDemo } from '../seed/cierresDemo';
import { sembrarBaseDemo } from '../seed/demo';
import { crearRepositorios } from '../sqlite/repos';
import * as uc from '../../application/useCases';
import * as ucc from '../../application/cierres/useCases';

function setup() {
  const db = getDbMemoria();
  sembrarBaseDemo(crearRepositorios(db)); // egresos/funnel/parámetros
  sembrarCierresDemo(crearReposCierres(db)); // cierres/pagos (fuente del dashboard)
  return { db, reposDash: crearRepositoriosDashboard(db), reposCierres: crearReposCierres(db) };
}

describe('Adaptador cierres/pagos → dashboard', () => {
  it('el dashboard lee cierres como ventas (mapeo de programa incluido)', () => {
    const { reposDash } = setup();
    const { snapshot } = uc.obtenerDashboardDelMes(reposDash, '2026-03');
    expect(snapshot.cierres.valor).toBeGreaterThan(0);
    expect(snapshot.ventasNuevas.valor).toBeGreaterThan(0);
    expect(snapshot.cashCollected.valor).toBeGreaterThan(0);
  });

  it('cash nuevo + cohortes = cash collected (mesOriginalVenta resuelto por el adaptador)', () => {
    const { reposDash } = setup();
    const { snapshot } = uc.obtenerDashboardDelMes(reposDash, '2026-03');
    expect(snapshot.cashNuevo + snapshot.cohortes).toBeCloseTo(snapshot.cashCollected.valor ?? 0, 2);
  });

  it("'Cero a Gestor' se proyecta a 'Gestor' para R8", () => {
    const { reposDash } = setup();
    const cmp = uc.compararProgramas(reposDash, '2026-03');
    expect(cmp.gestor.cierres.valor).toBeGreaterThan(0); // hay cierres "Cero a Gestor"
    expect(cmp.empresario.cierres.valor).toBeGreaterThan(0);
  });

  it('agregar un cierre + pago MUEVE los KPIs del dashboard al instante', () => {
    const { db, reposDash, reposCierres } = setup();
    const antes = uc.obtenerDashboardDelMes(reposDash, '2026-05').snapshot;

    const cierre = ucc.crearCierre(reposCierres, {
      fechaCierre: '2026-05-15', clienteNombre: 'Nuevo Cliente', programa: 'Empresario', ticketTotalUsd: 5000, closer: 'Ana',
    });
    ucc.agregarPago(reposCierres, {
      idCierre: cierre.idCierre, fechaPago: '2026-05-16', montoUsd: 2000, montoArs: 2_600_000, tipoPago: 'Reserva/Seña', medioPago: 'CRYPTO',
    });

    // Nueva instancia de adaptador sobre la MISMA db (como hace el server por request).
    const despues = uc.obtenerDashboardDelMes(crearRepositoriosDashboard(db), '2026-05').snapshot;
    expect(despues.cierres.valor!).toBe((antes.cierres.valor ?? 0) + 1);
    expect(despues.ventasNuevas.valor!).toBeCloseTo((antes.ventasNuevas.valor ?? 0) + 5000, 2);
    expect(despues.cashCollected.valor!).toBeCloseTo((antes.cashCollected.valor ?? 0) + 2000, 2);
  });

  it('eliminar un cierre quita su aporte del dashboard (cascade)', () => {
    const { db, reposCierres } = setup();
    const c = ucc.crearCierre(reposCierres, { fechaCierre: '2026-04-09', clienteNombre: 'Temp', programa: 'Empresario', ticketTotalUsd: 9999 });
    ucc.agregarPago(reposCierres, { idCierre: c.idCierre, fechaPago: '2026-04-09', montoUsd: 1234, tipoPago: 'Cuota', medioPago: 'Otro' });
    const con = uc.obtenerDashboardDelMes(crearRepositoriosDashboard(db), '2026-04').snapshot;
    ucc.eliminarCierre(reposCierres, c.idCierre);
    const sin = uc.obtenerDashboardDelMes(crearRepositoriosDashboard(db), '2026-04').snapshot;
    expect((con.cashCollected.valor ?? 0) - (sin.cashCollected.valor ?? 0)).toBeCloseTo(1234, 2);
  });

  it('los egresos siguen viniendo del repo legacy (margen calculable)', () => {
    const { reposDash } = setup();
    const { snapshot } = uc.obtenerDashboardDelMes(reposDash, '2026-03');
    expect(snapshot.egresosTotales).toBeGreaterThan(0);
    expect(snapshot.margenOperativo).not.toBeNull();
  });
});
