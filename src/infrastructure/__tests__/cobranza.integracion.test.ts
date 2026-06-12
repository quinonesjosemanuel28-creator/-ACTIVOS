import { describe, it, expect } from 'vitest';
import { getDbMemoria } from '../sqlite/db';
import { crearReposCierres } from '../sqlite/cierresRepos';
import { crearRepositorios } from '../sqlite/repos';
import { crearRepositoriosDashboard } from '../adapters/dashboardRepos';
import { sembrarBaseDemo } from '../seed/demo';
import { sembrarCierresDemo } from '../seed/cierresDemo';
import * as ucc from '../../application/cierres/useCases';
import * as ucob from '../../application/cobranza/useCases';
import * as uc from '../../application/useCases';

async function setup() {
  const db = getDbMemoria();
  await sembrarBaseDemo(crearRepositorios(db));
  await sembrarCierresDemo(crearReposCierres(db));
  return db;
}

describe('Cobranza · migración (legacy intactos) + plan', () => {
  it('los cierres demo (legacy, sin plan) quedan FUERA de cobranza', async () => {
    const db = await setup();
    const cob = await ucob.obtenerCobranza(crearReposCierres(db), '2026-06-01');
    expect(cob.cierres).toHaveLength(0); // ninguno tiene plan de cuotas
  });

  it('crearCierre con plan calcula monto de cuota = total / cantidad', async () => {
    const db = await setup();
    const repos = crearReposCierres(db);
    const c = await ucc.crearCierre(repos, {
      fechaCierre: '2026-05-02', clienteNombre: 'Nuevo', programa: 'Empresario', ticketTotalUsd: 4000, cantidadCuotas: 4, closer: 'Ana',
    });
    expect(c.cantidadCuotas).toBe(4);
    expect(c.montoCuotaUsd).toBe(1000);
    expect((await repos.cierres.obtener(c.idCierre))!.montoCuotaUsd).toBe(1000);
  });

  it('una venta nueva sin cobrar aparece en cobranza con saldo pendiente', async () => {
    const db = await setup();
    const repos = crearReposCierres(db);
    await ucc.crearCierre(repos, { idCierre: 'NV', fechaCierre: '2026-05-02', clienteNombre: 'Nuevo', programa: 'Empresario', ticketTotalUsd: 4000, cantidadCuotas: 4, closer: 'Ana' });
    await ucc.agregarPago(repos, { idCierre: 'NV', fechaPago: '2026-05-02', montoUsd: 1000, montoArs: 1_300_000, tipoPago: 'Reserva/Seña', medioPago: 'Otro', closer: 'Ana' });
    const cob = await ucob.obtenerCobranza(repos, '2026-05-10');
    const nv = cob.cierres.find((c) => c.idCierre === 'NV')!;
    expect(nv.saldoPendienteUsd).toBe(3000);
    expect(nv.estado).toBe('Al día'); // cuota 1 vence 01/06
  });

  it('REGLA CRÍTICA (integración): la cuota pendiente NO infló cash ni dashboard', async () => {
    const db = await setup();
    const repos = crearReposCierres(db);
    // dashboard de mayo ANTES
    const antes = (await uc.obtenerDashboardDelMes(crearRepositoriosDashboard(db), '2026-05')).snapshot.cashCollected.valor ?? 0;
    // venta nueva 4000 con plan, cobra solo la seña de 1000
    await ucc.crearCierre(repos, { idCierre: 'NV', fechaCierre: '2026-05-02', clienteNombre: 'Nuevo', programa: 'Empresario', ticketTotalUsd: 4000, cantidadCuotas: 4, closer: 'Ana' });
    await ucc.agregarPago(repos, { idCierre: 'NV', fechaPago: '2026-05-02', montoUsd: 1000, montoArs: 1_300_000, tipoPago: 'Reserva/Seña', medioPago: 'Otro', closer: 'Ana' });
    const despues = (await uc.obtenerDashboardDelMes(crearRepositoriosDashboard(db), '2026-05')).snapshot.cashCollected.valor ?? 0;
    expect(despues - antes).toBe(1000); // SOLO la seña cobrada, no las 3 cuotas pendientes
  });

  it('morosidad: venta vieja con cuota +30 días sin cobrar', async () => {
    const db = await setup();
    const repos = crearReposCierres(db);
    await ucc.crearCierre(repos, { idCierre: 'MORA', fechaCierre: '2026-01-05', clienteNombre: 'Deudor', programa: 'Empresario', ticketTotalUsd: 4000, cantidadCuotas: 4, closer: 'Ana' });
    // sin pagos; a junio la cuota 1 (vence 04/02) está +30 días vencida
    const cob = await ucob.obtenerCobranza(repos, '2026-06-01');
    const mora = cob.cierres.find((c) => c.idCierre === 'MORA')!;
    expect(mora.estado).toBe('Morosidad');
    expect(cob.resumen.morosidad).toBeGreaterThanOrEqual(1);
    expect(cob.resumen.morosidadUsd).toBeGreaterThan(0);
  });

  it('proyección agrupa el pendiente por mes (solo visual)', async () => {
    const db = await setup();
    const repos = crearReposCierres(db);
    await ucc.crearCierre(repos, { idCierre: 'P', fechaCierre: '2026-05-02', clienteNombre: 'X', programa: 'Empresario', ticketTotalUsd: 4000, cantidadCuotas: 4, closer: 'Ana' });
    await ucc.agregarPago(repos, { idCierre: 'P', fechaPago: '2026-05-02', montoUsd: 1000, montoArs: 1_300_000, tipoPago: 'Reserva/Seña', medioPago: 'Otro', closer: 'Ana' });
    const cob = await ucob.obtenerCobranza(repos, '2026-05-10');
    const totalProy = cob.proyeccion.reduce((a, p) => a + p.montoUsd, 0);
    expect(totalProy).toBe(3000); // 3 cuotas pendientes
  });
});

describe('Cobranza · marcar Inactivo (integración)', () => {
  it('inactivar saca de cobranza/lista negra y ajusta ticket; reactivar lo restaura, sin perder pagos', async () => {
    const db = await setup();
    const repos = crearReposCierres(db);
    await ucc.crearCierre(repos, { idCierre: 'INA', fechaCierre: '2026-01-02', clienteNombre: 'X', programa: 'Empresario', ticketTotalUsd: 4000, cantidadCuotas: 4, fechaPrimeraCuota: '2026-01-10', closer: 'Ana' });
    await ucc.agregarPago(repos, { idCierre: 'INA', fechaPago: '2026-01-05', montoUsd: 1000, montoArs: 1_300_000, tipoPago: 'Reserva/Seña', medioPago: 'Otro' });

    let cob = await ucob.obtenerCobranza(repos, '2026-06-01');
    expect(cob.cierres.find((c) => c.idCierre === 'INA')!.nivel).toBe('negro'); // +60d
    expect(cob.listaNegra.some((c) => c.idCierre === 'INA')).toBe(true);

    await ucc.marcarInactivo(repos, 'INA');
    expect(await repos.pagos.listarPorCierre('INA')).toHaveLength(1); // pagos preservados
    cob = await ucob.obtenerCobranza(repos, '2026-06-01');
    expect(cob.cierres.some((c) => c.idCierre === 'INA')).toBe(false); // fuera de cobranza
    expect(cob.listaNegra.some((c) => c.idCierre === 'INA')).toBe(false);
    const inac = cob.inactivos.find((c) => c.idCierre === 'INA')!;
    expect(inac.totalUsd).toBe(1000); // ticket ajustado a lo pagado
    expect(inac.saldoPendienteUsd).toBe(0);

    await ucc.reactivar(repos, 'INA');
    cob = await ucob.obtenerCobranza(repos, '2026-06-01');
    const reac = cob.cierres.find((c) => c.idCierre === 'INA')!;
    expect(reac.totalUsd).toBe(4000); // plan original restaurado
    expect(reac.saldoPendienteUsd).toBe(3000);
  });
});
